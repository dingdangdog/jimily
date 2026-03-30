# 031 — Jimi 对话防重复发送与请求幂等

## 变更时间

2026-03-30

## 背景

AI 响应慢时用户可能重复点击发送；`runPersistedUserChat` 在调用模型前已写入用户消息，若同一意图被多次提交（例如并发重复请求、代理/客户端重试携带相同标识），可能导致重复工具调用与重复记账。

## 方案

1. **前端 `JimiChat.vue`**
   - 发送前立即 `sending = true`，再清空输入与追加乐观气泡，缩短双击竞态窗口。
   - 每次发送生成 `clientRequestId`（优先 `crypto.randomUUID()`），随 `api/entry/ai/chat` 请求体提交。
   - 「重试」仍生成**新的** `clientRequestId`，表示用户明确要再跑一轮。
   - 在「正在回复/思考中」占位处增加简短说明：勿重复点发送；再处理请用「重试」。

2. **服务端 `runPersistedUserChat`**
   - 可选参数 `clientRequestId`（长度 ≤ 80，按 `userId + key` 隔离）。
   - **进行中**：相同 key 的并发请求共享同一 `Promise`，只执行一次 `executePersistedUserChat`。
   - **完成后**：结果 JSON 缓存约 8 分钟，相同 key 的重复请求直接返回缓存结果，不再写库、不再调 AI。
   - 未传 `clientRequestId` 时行为与旧版一致。

3. **API**
   - `POST api/entry/ai/chat` 与 `POST api/v1/ai/chat` 从 body 读取可选 `clientRequestId` 并传入 `runPersistedUserChat`。

## 局限

- 多标签页、多设备各自发送仍为不同 `clientRequestId`，无法合并。
- 用户在网络超时后**重新输入并发送**（新 UUID）仍可能产生第二条业务消息；彻底防重需更粗粒度的业务去重（如流水指纹），超出本次范围。

## 后续（见 032）

针对「超时误判后点重试导致重复记账」，已增加 **DB 持久化 `clientRequestId` + 会话内唯一 + 重试复用 id**，与本文所述内存幂等叠加使用。
