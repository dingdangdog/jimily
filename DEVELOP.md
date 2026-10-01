```bash
docker build -t dingdangdog/jimily:5.1.6 .
# 首次使用时创建并启用 buildx builder
docker buildx create --name jimily-builder --use
docker buildx inspect --bootstrap

docker buildx create --name jimily-builder --driver docker-container --use
docker buildx inspect --bootstrap

# 构建并推送同时支持 amd64/arm64 的多架构镜像
docker buildx build --platform linux/amd64,linux/arm64 -t dingdangdog/jimily:5.1.6 --push .

# 查看多架构镜像清单
docker buildx imagetools inspect dingdangdog/jimily:5.1.6

# 如果只是本地测试，load 只能导入当前宿主机架构镜像
docker buildx build --platform linux/amd64 -t dingdangdog/jimily:5.1.6-amd64 --load .

docker buildx build --platform linux/arm64 -t dingdangdog/jimily:5.1.6-arm64 --output type=docker,dest=./dingdangdog-jimily-5.1.6-arm64.tar .


docker save -o jimily.5.1.6.tar dingdangdog/jimily:5.1.6

docker load -i jimily.5.1.6.tar
```
