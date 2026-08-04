function decodeHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function xmlAttribute(xml, tag, name = "value") {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\s${name}=["']([^"']*)["']`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

export function extractCourses(xml) {
  const courses = [];
  const seen = new Set();
  const subjectPattern = /<subject\b[^>]*>([\s\S]*?)<\/subject>/gi;
  for (const subject of xml.matchAll(subjectPattern)) {
    const name = xmlAttribute(subject[1], "name").slice(0, 160);
    const key = name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
    if (!name || seen.has(key)) continue;
    const professor = xmlAttribute(subject[1], "professor").slice(0, 80);
    const timeRoom = subject[1].match(/<data\b[^>]*\splace=["']([^"']*)["']/i);
    const room = (timeRoom ? decodeHtml(timeRoom[1]) : xmlAttribute(subject[1], "place")).slice(0, 80);
    seen.add(key);
    courses.push({ name, professor, room });
  }
  return courses.slice(0, 80);
}

export function extractSemesterReferences(xml) {
  const references = [];
  const seen = new Set();
  for (const match of xml.matchAll(/<primaryTable\b([^>]*)\/?\s*>/gi)) {
    const tag = `<primaryTable ${match[1]}>`;
    const identifier = xmlAttribute(tag, "primaryTable", "identifier");
    const year = xmlAttribute(tag, "primaryTable", "year");
    const semester = xmlAttribute(tag, "primaryTable", "semester");
    if (!identifier || !year || !semester || seen.has(identifier)) continue;
    seen.add(identifier);
    references.push({ identifier, year, semester });
  }
  return references;
}

export function extractCurrentTable(xml) {
  const match = xml.match(/<table\b([^>]*)>/i);
  if (!match) return null;
  const tag = `<table ${match[1]}>`;
  return {
    identifier: xmlAttribute(tag, "table", "identifier"),
    year: xmlAttribute(tag, "table", "year"),
    semester: xmlAttribute(tag, "table", "semester"),
    status: xmlAttribute(tag, "table", "status"),
  };
}
