---
name: weather-qweather
description: 中国天气预报 - 使用和风天气API，支持全国城市查询。适用于获取中国城市的实时天气和预报。
---

# 和风天气预报

基于和风天气 API 的天气预报工具，支持中国城市实时天气和预报查询。

## 功能

- 实时天气查询
- 3天天气预报
- 多城市支持
- IP 定位（服务器位置）

## 安装

```bash
# 安装依赖 (如果需要)
# API 地址: ky2k5p3nt2.re.qweatherapi.com
```

## 使用方法

### 命令行

```bash
# 查询天气 (需要 API Key)
curl -s "https://ky2k5p3nt2.re.qweatherapi.com/v7/weather/now?location=101030100&key=YOUR_KEY"

# 3天预报
curl -s "https://ky2k5p3nt2.re.qweatherapi.com/v7/weather/3d?location=101030100&key=YOUR_KEY"
```

### 城市代码

| 城市 | 代码 |
|------|------|
| 北京 | 101010100 |
| 上海 | 101020100 |
| 天津 | 101030100 |
| 广州 | 101280101 |
| 深圳 | 101280601 |
| 杭州 | 101210101 |
| 成都 | 101270101 |

## 获取 API Key

1. 访问 https://qweather.com
2. 注册账号
3. 创建应用获取 Key
4. 免费版：1000次/天

## 脚本示例

```javascript
// weather.js
const API_HOST = 'ky2k5p3nt2.re.qweatherapi.com';
const API_KEY = process.env.QWEATHER_KEY;

async function getWeather(location) {
  const url = `https://${API_HOST}/v7/weather/now?location=${location}&key=${API_KEY}`;
  const response = await fetch(url);
  return response.json();
}
```

## 响应示例

```json
{
  "code": "200",
  "now": {
    "temp": "17",
    "feelsLike": "12",
    "text": "晴",
    "windDir": "北风",
    "windScale": "3"
  }
}
```

## 许可证

MIT
