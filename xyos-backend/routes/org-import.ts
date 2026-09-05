import { Router } from "express";
import { dbAll, dbRun } from "../db";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import multer from "multer";
import unzipper from "unzipper";
import { Readable } from "stream";

export const orgImportRoutes = Router();
orgImportRoutes.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

interface ParsedNode {
  name: string;
  children: ParsedNode[];
  note?: string;
}

orgImportRoutes.post("/import", requireAdmin, upload.single("file"), async (req: AuthRequest, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: "请上传文件" });

    const ext = file.originalname.toLowerCase().split(".").pop();
    let parsed: ParsedNode[] = [];

    if (ext === "xmind") {
      parsed = await parseXmind(file.buffer);
    } else if (ext === "vsdx") {
      parsed = await parseVsdx(file.buffer);
    } else if (ext === "json") {
      try {
        const json = JSON.parse(file.buffer.toString("utf-8"));
        parsed = parseJsonTree(json);
      } catch (e: any) {
        return res.status(400).json({ success: false, error: `JSON解析失败: ${e.message}` });
      }
    } else {
      return res.status(400).json({ success: false, error: "不支持的文件格式，请上传 .xmind、.vsdx 或 .json 文件" });
    }

    if (parsed.length === 0) {
      return res.status(400).json({ success: false, error: "未能从文件中解析出组织架构数据" });
    }

    const tid = req.user!.tenant_id;
    let deptCount = 0;
    let empCount = 0;

    function saveNode(nodes: ParsedNode[], parentId: number | null, sortOrder: number) {
      for (const node of nodes) {
        const result = dbRun(
          "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id) VALUES (?, ?, ?, ?, ?, ?)",
          [1, node.name, parentId, sortOrder, node.note || "", tid]
        );
        deptCount++;
        const deptId = result.lastInsertRowid;

        if (node.children.length > 0) {
          saveNode(node.children, deptId, 0);
        }
      }
    }

    saveNode(parsed, null, 0);

    res.json({
      success: true,
      dept_count: deptCount,
      emp_count: empCount,
      message: `成功导入 ${deptCount} 个部门`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function parseXmind(buffer: Buffer): Promise<ParsedNode[]> {
  let contentJson: any = null;

  await new Promise<void>((resolve, reject) => {
    const stream = Readable.from(buffer);
    stream
      .pipe(unzipper.Parse())
      .on("entry", (entry: any) => {
        const fileName = entry.path;
        if (fileName === "content.json") {
          entry.buffer().then((buf: Buffer) => {
            try {
              contentJson = JSON.parse(buf.toString("utf-8"));
            } catch (e) {}
            entry.autodrain();
          });
        } else if (fileName === "content.xml") {
          entry.buffer().then((buf: Buffer) => {
            const xml = buf.toString("utf-8");
            contentJson = parseXmindXml(xml);
            entry.autodrain();
          });
        } else {
          entry.autodrain();
        }
      })
      .on("close", resolve)
      .on("error", reject);
  });

  if (!contentJson) {
    throw new Error("无法解析Xmind文件：未找到content.json或content.xml");
  }

  return extractXmindTopics(contentJson);
}

function extractXmindTopics(data: any): ParsedNode[] {
  const results: ParsedNode[] = [];

  if (Array.isArray(data)) {
    for (const sheet of data) {
      if (sheet.rootTopic) {
        const root = convertXmindTopic(sheet.rootTopic);
        if (root.children.length > 0) {
          results.push(...root.children);
        } else {
          results.push(root);
        }
      }
    }
  } else if (data.rootTopic) {
    const root = convertXmindTopic(data.rootTopic);
    if (root.children.length > 0) {
      results.push(...root.children);
    } else {
      results.push(root);
    }
  }

  return results;
}

function convertXmindTopic(topic: any): ParsedNode {
  const children: ParsedNode[] = [];

  if (topic.children?.attached) {
    for (const child of topic.children.attached) {
      children.push(convertXmindTopic(child));
    }
  }

  return {
    name: topic.title || "未命名",
    children,
    note: topic.notes?.plain?.content || undefined,
  };
}

function parseXmindXml(xml: string): any {
  const topics: ParsedNode[] = [];
  const topicRegex = /<topic[^>]*>[\s\S]*?<title>(.*?)<\/title>([\s\S]*?)<\/topic>/g;
  let match;
  while ((match = topicRegex.exec(xml)) !== null) {
    topics.push({ name: match[1], children: [] });
  }
  return [{ rootTopic: { title: "Root", children: { attached: topics } } }];
}

async function parseVsdx(buffer: Buffer): Promise<ParsedNode[]> {
  const shapes: { id: string; name: string; text: string; parentId: string | null }[] = [];
  const connections: { from: string; to: string }[] = [];
  let pageXml = "";

  await new Promise<void>((resolve, reject) => {
    const stream = Readable.from(buffer);
    stream
      .pipe(unzipper.Parse())
      .on("entry", (entry: any) => {
        const fileName = entry.path;
        if (fileName.match(/visio\/pages\/page\d+\.xml/i)) {
          entry.buffer().then((buf: Buffer) => {
            pageXml = buf.toString("utf-8");
            entry.autodrain();
          });
        } else if (fileName.match(/visio\/pages\/_rels\/page\d+\.xml\.rels/i)) {
          entry.autodrain();
        } else {
          entry.autodrain();
        }
      })
      .on("close", resolve)
      .on("error", reject);
  });

  if (!pageXml) {
    throw new Error("无法解析Visio文件：未找到页面数据");
  }

  parseVisioShapes(pageXml, shapes, connections);
  return buildTreeFromVisio(shapes, connections);
}

function parseVisioShapes(
  xml: string,
  shapes: { id: string; name: string; text: string; parentId: string | null }[],
  connections: { from: string; to: string }[]
) {
  const shapeRegex = /<Shape[^>]*ID="(\d+)"[^>]*Name="([^"]*)"[^>]*>([\s\S]*?)<\/Shape>/g;
  let match;

  while ((match = shapeRegex.exec(xml)) !== null) {
    const id = match[1];
    const name = match[2];
    const content = match[3];

    const textMatch = content.match(/<Text[^>]*>([\s\S]*?)<\/Text>/);
    let text = "";
    if (textMatch) {
      text = textMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
    }

    const parentMatch = content.match(/<Parent[^>]*>(\d+)<\/Parent>/);
    const parentId = parentMatch ? parentMatch[1] : null;

    if (text) {
      shapes.push({ id, name, text, parentId });
    }
  }

  const connectRegex = /<Connect[^>]*FromSheet="(\d+)"[^>]*ToSheet="(\d+)"/g;
  while ((match = connectRegex.exec(xml)) !== null) {
    connections.push({ from: match[1], to: match[2] });
  }
}

function buildTreeFromVisio(
  shapes: { id: string; name: string; text: string; parentId: string | null }[],
  connections: { from: string; to: string }[]
): ParsedNode[] {
  const shapeMap = new Map(shapes.map((s) => [s.id, s]));
  const childIds = new Set<string>();

  for (const conn of connections) {
    childIds.add(conn.to);
  }

  const rootIds = shapes
    .filter((s) => !childIds.has(s.id) && !s.parentId)
    .map((s) => s.id);

  function buildNode(id: string): ParsedNode {
    const shape = shapeMap.get(id)!;
    const childNodeIds = connections
      .filter((c) => c.from === id)
      .map((c) => c.to);

    return {
      name: shape.text,
      children: childNodeIds.map((cid) => buildNode(cid)),
    };
  }

  if (rootIds.length === 0 && shapes.length > 0) {
    return [{ name: shapes[0].text, children: shapes.slice(1).map((s) => ({ name: s.text, children: [] })) }];
  }

  return rootIds.map((id) => buildNode(id));
}

function parseJsonTree(json: any): ParsedNode[] {
  if (Array.isArray(json)) {
    return json.map((item) => parseJsonNode(item));
  }
  if (json.name || json.title || json.label) {
    return [parseJsonNode(json)];
  }
  if (json.children) {
    return json.children.map((item: any) => parseJsonNode(item));
  }
  return [];
}

function parseJsonNode(obj: any): ParsedNode {
  const name = obj.name || obj.title || obj.label || obj.text || "未命名";
  const children: ParsedNode[] = [];

  const kids = obj.children || obj.subtopics || obj.items || obj.nodes || [];
  if (Array.isArray(kids)) {
    for (const kid of kids) {
      children.push(parseJsonNode(kid));
    }
  }

  return {
    name,
    children,
    note: obj.note || obj.description || obj.notes || undefined,
  };
}
