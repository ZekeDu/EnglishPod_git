## EnglishPod 365 — 课程批量导入模板说明（v1.2）

> 本文档对应管理后台“批量导入”功能，模板示例位于 `tools/import-template/lessons.json`。  
> 新增课程字段请同步更新此文档，确保与后台「新建课程」表单一致。

---

### 1. 压缩包结构

```
lesson-import.zip
 ├─ lessons.json        # 多课程元数据（必填）
 └─ audio/              # 音频文件（可选）
     ├─ 1_main.mp3
     └─ 1_podcast.mp3
```

`lessons.json` 顶层结构：

```json
{
  "version": "1.2",
  "lessons": [ /* Lesson 对象数组 */ ]
}
```

---

### 2. Lesson 对象字段详解

| 字段 | 说明 |
| --- | --- |
| `id` / `lesson_no` | 课程编号，必须为数字字符串；若同时提供 `lesson_no`，系统会同步更新 |
| `meta` | 基础信息（详见下表） |
| `transcript` | 逐句字幕 |
| `vocab` | 词汇卡片 |
| `practice` | 完形/作文练习 |
| `podcast` | 主持人播客（可选） |

#### 2.1 `meta`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 课程标题（必填） |
| `level` | string | 难度，可选值：`Elementary` / `Intermediate` / `Upper-Intermediate` / 其他自定义 |
| `tags` | string[] | 标签数组；导入时支持自动切分 |
| `duration` | number | 音频时长（秒，可选） |
| `published` | boolean | 是否发布（可选，默认 false） |
| `audio` | object | 主音频：`{ "file": "1_main.mp3" }` 或 `{ "url": "https://..." }` |

> 导入后系统会自动将 `audio.file` 写入 `data/uploads/lesson-import/<id>/main.ext` 并填充 `audio_url`；若使用 `url` 则直接引用远程音频。

#### 2.2 `transcript`

```json
{
  "segments": [
    { "idx": 0, "start_sec": 8.67, "end_sec": 15.11, "text_en": "...", "text_zh": "..." }
  ]
}
```

- `segments` 必须按 `start_sec` 递增，`start_sec` 必填。  
- `end_sec` 可选，如缺失系统会根据下一句或音频时长推断。  
- `text_en` 必填；`text_zh` 可省略。

#### 2.3 `vocab`

```json
{
  "cards": [
    { "id": "1-0", "word": "complimentary", "pos": "Adjective", "meaning": "free" }
  ]
}
```

- 必填字段：`word`（或 `phrase`）、`meaning`。  
- 可选字段：`pos`、`examples`（数组）、`extra`（对象）。  
- 如省略 `id`，系统会自动以 `<lessonId>-<index>` 填充。旧字段 `definition` 仍兼容。

#### 2.4 `practice`

```json
"practice": {
  "cloze": {
    "passage": "I {1} English.",
    "items": [
      { "index": 1, "options": ["like", "likes"], "answer": "like", "analysis": "提示" }
    ]
  },
  "essay": {
    "prompt": "Write...",
    "min_words": 30,
    "max_words": 200,
    "rubric": { "spelling": 1, "grammar": 1, "clarity": 1 }
  }
}
```

- 完形 `passage` 使用 `{数字}` 占位；`items[].options` 必须包含正确答案。  
- 作文 `prompt` 必填；`rubric` 为评分维度权重。

#### 2.5 `podcast`（可选）

```json
"podcast": {
  "meta": { "duration": 600 },
  "audio": { "file": "1_podcast.mp3" },
  "transcript": {
    "dialogue": [
      { "idx": 0, "speaker": "Host", "text": "..." }
    ]
  }
}
```

- 结构与 `meta.audio` 类似；支持 `file` 或 `url`。  
- `dialogue` 中 `text` 必填，`speaker` 选填。

---

### 3. 示例（节选）

仓库已提供参考模板 `tools/import-template/lessons.json`，其中课程 1 的字段摘录如下：

```json
{
  "id": "1",
  "meta": {
    "title": "Difficult Customer",
    "level": "Elementary",
    "tags": ["restaurant", "dialogue", "grab"],
    "duration": 61,
    "published": true,
    "audio": { "file": "1_main.mp3" }
  },
  "transcript": {
    "segments": [
      { "idx": 0, "start_sec": 8.67, "end_sec": 15.11, "text_en": "A: Good evening..." }
    ]
  },
  "vocab": {
    "cards": [
      { "id": "1-0", "word": "still working on", "pos": "Phrase", "meaning": "not yet completed, need more time" }
    ]
  },
  "practice": {
    "cloze": {
      "passage": "May I {1} your order? ... I’ll just {5} a burger across the street.",
      "items": [
        { "index": 1, "options": ["take", "go with", "grab", "recommend"], "answer": "take" }
      ]
    },
    "essay": {
      "prompt": "Describe a difficult customer experience at a restaurant...",
      "min_words": 30,
      "max_words": 200
    }
  },
  "podcast": {
    "meta": { "duration": 600 },
    "audio": { "file": "1_podcast.mp3" }
  }
}
```

> 将该 `lessons.json` 与 `audio/1_main.mp3`、`audio/1_podcast.mp3` 一同压缩为 Zip，上传即可导入示例课程。

---

### 4. 校验与导入选项

- 后台上传支持 Query 参数：  
  - `dry_run=1`：仅校验不写入  
  - `overwrite=`：`all`（默认）或 `meta,transcript,...`  
  - `publish=1`：导入成功后自动发布
- 本地校验脚本：
  ```bash
  node packages/scripts/import-lessons.js
  ```
  会遍历 `data/lessons/<id>/` 并输出错误列表。
- 数据库导出（生成 UPSERT SQL）：
  ```bash
  npm run export:sql > /tmp/lessons.sql
  psql "$DATABASE_URL" -f /tmp/lessons.sql
  ```

---

### 5. 命名建议（使用 `audio.file` 时）

- 课文主音频：`<lessonId>_main.mp3`
- 播客音频：`<lessonId>_podcast.mp3`

音频将被存储到 `data/uploads/lesson-import/<lessonId>/` 并在课程详情页通过 `/media/lesson/:id/{main|podcast}` 提供访问。

---

如需扩展字段（例如课程封面、额外练习类型），请同步更新后台 `LessonService` 和此模板文档，确保导入流程兼容。
