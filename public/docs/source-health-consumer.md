# MoonTV 源站健康清单 · 下游接入说明

## 这是什么

MoonTV 上游每 12 小时探测一次 `config.json` 里的全部 CMS 源站，把结果发布成一份 JSON 清单。
下游（Hermes）直接消费这份清单，不必各自重复探测死源。

探测判定：**HTTP 200 + 合法 JSON + `list` 非空** 才算 `ok=true`。
探测点位于国内家宽（NAS），单次最大 12 秒，不重试。

## 取数地址

```
GET https://moontv.12879737.xyz/api/sources/health
```

- 无需鉴权
- 响应头 `Cache-Control: public, max-age=300`，请勿缓存超过 5 分钟
- 建议拉取频率：每 3–12 小时；不需要更频繁
- 静态快照（备用，随部署更新）：`https://moontv.12879737.xyz/docs/sources_health.json`

## 字段

| 字段 | 说明 |
|---|---|
| `generated_at` | 本次探测完成时间，含时区（如 `2026-10-18T09:20:00+08:00`） |
| `summary` | `{ total, ok, failed }` |
| `sources[].key` | 源站唯一标识，与 MoonTV 配置里的 key 一致 |
| `sources[].name` | 源站名称 |
| `sources[].api` | 下游应使用的 CMS 基地址 |
| `sources[].probe_url` | 实际探测请求的完整 URL，仅用于排查 |
| `sources[].ok` | 是否健康（200 + 合法 JSON + 非空 list） |
| `sources[].http_status` | HTTP 状态码；连接失败时为 `null` |
| `sources[].items` | 本次请求返回的条目数 |
| `sources[].latency_ms` | 本次请求耗时（毫秒） |
| `sources[].checked_at` | 该源本次检查时间 |
| `sources[].last_ok` | 最后一次成功的绝对时间；**从未成功则为 `null`** |
| `sources[].consecutive_fails` | 连续失败次数，成功即归零 |
| `sources[].error` | 失败原因，带类别前缀 |

`error` 可能取值：

```
DNS: ...
Connection refused
Connection reset
Timeout
HTTP 503
NotJSON: <前 60 字符>
EmptyList
TLS: ...
Network: ...
```

## 建议的使用规则

1. **先校验新鲜度**：`generated_at` 距现在超过 3 小时 → 视为探测任务失效，回落本地探测。
2. 按 `key` 建立索引，不要依赖 `sources` 数组顺序。
3. `consecutive_fails >= 3` → 暂不抓取该源。
4. `ok=true` 或 `consecutive_fails < 3` → 正常使用；`ok` 由 `false` 转为 `true` 即自动恢复。
5. 只失败 1 次不要摘源，避免网络抖动误杀。
6. `last_ok` 为 `null` 表示"上游从未观察到该源成功"，可用于报警或人工确认。

## Python 示例

```python
import datetime
import httpx

HEALTH_URL = "https://moontv.12879737.xyz/api/sources/health"
FAIL_THRESHOLD = 3
MAX_AGE = datetime.timedelta(hours=3)


def load_health() -> dict[str, dict]:
    response = httpx.get(HEALTH_URL, timeout=10)
    response.raise_for_status()
    data = response.json()

    generated = datetime.datetime.fromisoformat(data["generated_at"])
    if datetime.datetime.now(generated.tzinfo) - generated > MAX_AGE:
        return {}  # 清单过期，调用方回落本地探测

    return {item["key"]: item for item in data["sources"]}


def is_source_usable(health: dict[str, dict], key: str) -> bool:
    item = health.get(key)
    if item is None:
        return True  # 清单里没有该源，保持原有行为
    return item["consecutive_fails"] < FAIL_THRESHOLD
```

## 兼容性

- 字段只会新增，不会删除或改名；未知字段请忽略。
- `sources` 顺序不保证稳定，请按 `key` 索引。
- 清单反映的是国内家宽探测点的结果；个别源存在地域差异，因此不建议把单次失败当作死源。
