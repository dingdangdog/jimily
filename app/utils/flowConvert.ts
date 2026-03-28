import { typeRelationStore } from "./store";
import type { Flow } from "~/utils/table";

/**
 * 模板导入
 */
export function templateConvert(
  row: any[],
  indexMap: Record<string, number>
): Flow {
  const flow: Flow | any = {};
  flow.day = row[indexMap["交易时间"]];
  flow.flowType = String(row[indexMap["收/支"]]);
  flow.industryType = String(row[indexMap["交易分类"]]);
  flow.channelHint = String(row[indexMap["支付/付款方式"]]);
  flow.money = row[indexMap["金额"]];
  flow.attribution = String(row[indexMap["流水归属"]]);
  flow.name = String(row[indexMap["交易对方"]]);
  flow.description = String(row[indexMap["备注"]]);
  return flow;
}

function safeOrderNo(v: unknown, maxLen = 50): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v) || !Number.isInteger(v) || !Number.isSafeInteger(v)) {
      return "";
    }
    return String(v).trim().slice(0, maxLen);
  }
  return String(v).trim().slice(0, maxLen);
}

const FLOWNO_CHANNEL_PREFIX: Record<string, string> = {
  alipay: "A_",
  wxpay: "W_",
  jdFinance: "J_",
};
const FLOWNO_MAX_LEN = 50;
const FLOWNO_PREFIX_LEN = 2;

function flowNoWithChannel(flowNoStr: string, channel?: string): string {
  if (!channel || !FLOWNO_CHANNEL_PREFIX[channel]) return flowNoStr;
  const prefix = FLOWNO_CHANNEL_PREFIX[channel];
  const maxRaw = FLOWNO_MAX_LEN - prefix.length;
  return prefix + flowNoStr.slice(0, maxRaw);
}

/**
 * 支付宝
 */
export function alipayConvert(
  row: any[],
  indexMap: Record<string, number>,
  channel?: string
): Flow {
  const flow: Flow | any = {};
  flow.day = row[indexMap["交易时间"]];
  flow.flowType = String(row[indexMap["收/支"]]);
  flow.industryType = typeConvert(row[indexMap["交易分类"]]);
  flow.channelHint = "支付宝";
  flow.money = row[indexMap["金额"]];
  flow.name = String(row[indexMap["交易对方"]]);
  flow.description =
    row[indexMap["商品说明"]] +
    "-" +
    row[indexMap["收/付款方式"]] +
    "-" +
    row[indexMap["备注"]];
  const raw = row[indexMap["交易订单号"]];
  const flowNoStr = safeOrderNo(
    raw,
    channel ? FLOWNO_MAX_LEN - FLOWNO_PREFIX_LEN : FLOWNO_MAX_LEN
  );
  if (flowNoStr !== "") flow.flowNo = flowNoWithChannel(flowNoStr, channel);
  return flow;
}

export function typeConvert(type: any): string {
  const ts = typeRelationStore.value.filter((t) => t.source == type);
  return ts.length > 0 ? ts[0].target : type;
}

/**
 * 微信支付
 */
export function wxpayConvert(
  row: any[],
  indexMap: Record<string, number>,
  channel?: string
): Flow {
  const flow: Flow | any = {};
  flow.day = row[indexMap["交易时间"]];
  flow.flowType =
    row[indexMap["收/支"]] == "/" ? "不计收支" : row[indexMap["收/支"]];
  flow.industryType = String(typeConvert(row[indexMap["交易类型"]]));
  flow.channelHint = "微信";

  const wxMoneyRaw = row[indexMap["金额(元)"]];
  flow.money =
    typeof wxMoneyRaw === "number"
      ? wxMoneyRaw
      : parseFloat(String(wxMoneyRaw ?? "").replace("¥", "").replace("￥", ""));

  flow.name = String(row[indexMap["商品"]]);
  flow.description =
    row[indexMap["交易对方"]] +
    "-" +
    row[indexMap["支付方式"]] +
    "-" +
    row[indexMap["备注"]];
  const raw = row[indexMap["交易单号"]];
  const flowNoStr = safeOrderNo(
    raw,
    channel ? FLOWNO_MAX_LEN - FLOWNO_PREFIX_LEN : FLOWNO_MAX_LEN
  );
  if (flowNoStr !== "") flow.flowNo = flowNoWithChannel(flowNoStr, channel);
  return flow;
}

/**
 * 京东金融
 */
export function jdFinanceConvert(
  row: any[],
  indexMap: Record<string, number>,
  channel?: string
): Flow {
  const flow: Flow | any = {};
  flow.day = row[indexMap["交易时间"]];
  flow.flowType = String(row[indexMap["收/支"]]);
  flow.industryType = typeConvert(row[indexMap["交易分类"]]);
  flow.channelHint = "京东金融";

  const jdMoney = String(row[indexMap["金额"]]);
  const match = jdMoney.match(/^(\d*\.?\d+)(.*)/);
  flow.money = match ? match[1] : jdMoney;
  const desc = match ? match[2] : "";
  flow.name = String(row[indexMap["交易说明"]]);
  flow.description =
    desc +
    row[indexMap["商户名称"]] +
    "-" +
    row[indexMap["收/付款方式"]] +
    "-" +
    row[indexMap["备注"]];
  const raw = row[indexMap["交易订单号"]];
  const flowNoStr = safeOrderNo(
    raw,
    channel ? FLOWNO_MAX_LEN - FLOWNO_PREFIX_LEN : FLOWNO_MAX_LEN
  );
  if (flowNoStr !== "") flow.flowNo = flowNoWithChannel(flowNoStr, channel);
  return flow;
}
