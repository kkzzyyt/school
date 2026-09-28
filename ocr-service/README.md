# 座位图 OCR 服务

这是只在本机回环端口提供服务的 PaddleOCR 适配器。Next.js 将图片字节转发到 `127.0.0.1:8077`，服务只返回识别出的文字、可信度和坐标，不保存图片或学生信息。

## 运行

在项目根目录执行：

```bash
docker compose -f docker-compose.ocr.yml up -d --build
curl -fsS http://127.0.0.1:8077/health
```

首次启动会从 PaddlePaddle 官方模型源下载 PP-OCRv5 的移动端检测与识别模型，模型缓存在 Docker 卷 `school_ocr_models` 中。图片不发送到模型下载站点。CPU 服务只启动一个模型实例、单线程推理，容器内存上限为 1250 MiB；在低内存服务器上请先观察 `docker stats` 再启用多人同时上传。

Next.js 默认连接 `http://127.0.0.1:8077`。如需换端口，可设置 `SEATING_OCR_URL`，但出于隐私和网络边界考虑，该地址仅接受 `127.0.0.1` 或 `localhost`。Docker Compose 只把 OCR 端口发布到宿主机回环地址，公网无法直连。

## 支持范围

- 图片：PNG、JPEG、WebP，最多 5 MiB，100 × 100 至 1200 万像素。
- 座位结构：带有“第 N 排”和“第 N 座”标记的座位图截图。能识别“过道”和“讲台”标记。
- 字符置信度低于 0.75 时要求教师核对。未匹配学生可以在导入弹窗中重新指定或留空。
- 无行列标记、行列标签缺失或重复时，不猜测座位坐标，提示使用更清晰的截图。

运行适配器测试无需下载模型：

```bash
python3 -m unittest discover -s ocr-service -p 'test_*.py'
```

PaddleOCR 3.x 的安装与结果字段以[官方文档](https://www.paddleocr.ai/v3.3.0/en/version3.x/pipeline_usage/OCR.html)为准。
