# 串口网关 (front/gateway)

用于把 WebSocket 指令转成 STM32 串口文本协议，并把 STM32 回包广播给前端。

## 1. 安装依赖

```bash
cd front/gateway
npm install
```

如果 PowerShell 执行策略拦截 `npm`，请用：

```bash
cmd /c npm install
```

## 2. 启动

默认串口参数：`COM5 @ 9600`，WebSocket 端口：`8787`。

```bash
cd front/gateway
npm start
```

也可自定义：

```bash
set SERIAL_PORT=COM5
set SERIAL_BAUD=9600
set WS_PORT=8787
npm start
```

## 3. WebSocket 入站消息 (JSON)

- 运动：`{"type":"move","id":1,"pos":500,"time":300}`
- 读位置：`{"type":"query","id":1}`
- 读电压：`{"type":"vin","id":1}`
- 心跳：`{"type":"ping"}`
- 透传：`{"type":"raw","line":"M,1,500,300"}`

## 4. MCU 文本协议（网关下发）

- `M,<id>,<pos>,<time_ms>`
- `Q,<id>`
- `V,<id>`
- `PING`

## 5. MCU 文本回包（网关接收）

- `OK`
- `ERR,<code>`
- `P,<id>,<pos>`
- `V,<id>,<mv>`

## 6. joints.json direct write

Gateway now supports reading/writing `front/web/joints.json` over the existing WebSocket link.

- Read config:
  - request: `{"type":"config_read","requestId":"r1"}`
  - reply: `{"type":"config_read_ack","ok":true,"requestId":"r1","config":{...}}`
- Write config:
  - request: `{"type":"config_write","requestId":"w1","config":{...}}`
  - reply: `{"type":"config_write_ack","ok":true,"requestId":"w1"}`

Notes:
- `config_read/config_write` do not require serial to be open.
- Frontend `Write selected J` prefers this path, so no file picker is needed when gateway is connected.
