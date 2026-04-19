const state = {
  posts: [],
  query: "",
  tag: "",
};

const view = document.querySelector("#view");
const searchInput = document.querySelector("#searchInput");
const tagFilters = document.querySelector("#tagFilters");

const fallbackPosts = [
  {
    title: "Start Here",
    date: "2026-04-17",
    slug: "start-here",
    description:
      "A sample post rendered from Markdown. Add your own files to the posts folder and list them in posts.json.",
    tags: ["Publishing", "Markdown"],
    cover:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1400&q=82",
    file: "posts/start-here.md",
    readingTime: "2 min read",
  },
];

init();

async function init() {
  bindEvents();
  await loadPosts();
  renderTagFilters();
  route();
}

function bindEvents() {
  window.addEventListener("hashchange", route);

  searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    if (getRoute().page === "home") {
      renderHome();
    }
  });
}

async function loadPosts() {
  try {
    const response = await fetch("posts.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load posts.json: ${response.status}`);
    }

    const posts = await response.json();
    state.posts = posts
      .map(normalizePost)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.warn(error);
    state.posts = fallbackPosts;
  }
}

function normalizePost(post) {
  return {
    title: post.title ?? "Untitled",
    date: post.date ?? "",
    slug: post.slug ?? slugify(post.title ?? "untitled"),
    description: post.description ?? "",
    tags: Array.isArray(post.tags) ? post.tags : [],
    cover: post.cover ?? "",
    file: post.file ?? "",
    readingTime: post.readingTime ?? "",
  };
}

function getRoute() {
  const hash = window.location.hash || "#/";
  const [, page, slug] = hash.match(/^#\/?([^/]+)?\/?(.+)?$/) || [];

  if (!page) {
    return { page: "home" };
  }

  if (page === "post") {
    return { page: "post", slug };
  }

  return { page };
}

function route() {
  const routeInfo = getRoute();
  const isArticle = routeInfo.page === "post";
  const isHome = routeInfo.page === "home";
  document.body.classList.toggle("is-reading", isArticle);
  document.querySelector(".hero").hidden = !isHome;
  document.querySelector(".toolbar").hidden = !isHome;

  if (!isArticle) {
    document.title = "Prem Writes";
  }

  if (routeInfo.page === "post") {
    renderPost(routeInfo.slug);
  } else if (routeInfo.page === "archive") {
    renderArchive();
  } else if (routeInfo.page === "about") {
    renderAbout();
  } else {
    renderHome();
  }
}

function renderTagFilters() {
  const tags = [...new Set(state.posts.flatMap((post) => post.tags))].sort();
  tagFilters.innerHTML = "";

  const allButton = createTagButton("All", "");
  tagFilters.append(allButton);

  tags.forEach((tag) => {
    tagFilters.append(createTagButton(tag, tag));
  });
}

function createTagButton(label, tag) {
  const button = document.createElement("button");
  button.className = "tag";
  button.type = "button";
  button.textContent = label;
  button.dataset.tag = tag;
  button.classList.toggle("is-active", state.tag === tag);

  button.addEventListener("click", () => {
    state.tag = tag;
    document
      .querySelectorAll(".tag")
      .forEach((tagButton) =>
        tagButton.classList.toggle("is-active", tagButton.dataset.tag === tag),
      );
    renderHome();
  });

  return button;
}

function renderHome() {
  const posts = getFilteredPosts();
  view.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Latest writing</p>
        <h2>Fresh from the desk</h2>
      </div>
      <p>Browse every note, or use search and tags to find the thread you want.</p>
    </div>
    ${posts.length ? renderPostGrid(posts) : renderEmptyState()}
  `;
}

function renderArchive() {
  const postsByYear = state.posts.reduce((years, post) => {
    const year = post.date ? new Date(post.date).getFullYear() : "Undated";
    years[year] = years[year] || [];
    years[year].push(post);
    return years;
  }, {});

  const years = Object.keys(postsByYear).sort((a, b) => Number(b) - Number(a));

  view.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Archive</p>
        <h2>All notes</h2>
      </div>
      <p>${state.posts.length} ${state.posts.length === 1 ? "piece" : "pieces"} in the library.</p>
    </div>
    <div class="article">
      ${years
        .map(
          (year) => `
            <h2>${escapeHtml(year)}</h2>
            <ul>
              ${postsByYear[year]
                .map(
                  (post) => `
                    <li>
                      <a href="#/post/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a>
                      <span class="meta">${formatDate(post.date)} · ${escapeHtml(post.readingTime)}</span>
                    </li>
                  `,
                )
                .join("")}
            </ul>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderAbout() {
  view.innerHTML = `
    <article class="article-shell">
      <div class="article-top">
        <a class="back-link" href="#/">Back to notes</a>
        <p class="eyebrow">About</p>
        <h1 class="article-title">A calm place for finished thoughts.</h1>
        <p class="article-description">
          Write each article as Markdown, keep your posts in one folder, and publish the same files to GitHub Pages.
        </p>
      </div>
      <div class="article">
        <h2>How to publish</h2>
        <ol>
          <li>Add a Markdown file inside <code>posts/</code>.</li>
          <li>Add its details to <code>posts.json</code>.</li>
          <li>Push the folder to a GitHub repository.</li>
          <li>Enable GitHub Pages for the repository branch.</li>
        </ol>
        <p>
          The site uses hash links such as <code>#/post/start-here</code>, so every page works on static hosting without server rewrites.
        </p>
      </div>
    </article>
  `;
}

function getFilteredPosts() {
  return state.posts.filter((post) => {
    const haystack = [post.title, post.description, post.tags.join(" ")]
      .join(" ")
      .toLowerCase();
    const matchesQuery = !state.query || haystack.includes(state.query);
    const matchesTag = !state.tag || post.tags.includes(state.tag);

    return matchesQuery && matchesTag;
  });
}

function renderPostGrid(posts) {
  return `
    <div class="post-grid">
      ${posts.map(renderPostCard).join("")}
    </div>
  `;
}

function renderPostCard(post) {
  return `
    <a class="post-card" href="#/post/${encodeURIComponent(post.slug)}">
      <img src="${escapeAttribute(post.cover)}" alt="" loading="lazy" />
      <div class="post-card-body">
        <div class="meta">
          <span>${formatDate(post.date)}</span>
          <span>${escapeHtml(post.readingTime)}</span>
        </div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.description)}</p>
        <div class="post-card-tags">
          ${post.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
    </a>
  `;
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <h2>No notes matched.</h2>
      <p>Clear the search field or choose another tag.</p>
      <button class="clear-button" type="button" onclick="clearFilters()">Clear filters</button>
    </div>
  `;
}

async function renderPost(slug) {
  const post = state.posts.find((item) => item.slug === slug);

  if (!post) {
    view.innerHTML = `
      <div class="status">
        <h2>Post not found</h2>
        <p>The note you requested is not in <code>posts.json</code>.</p>
        <a class="back-link" href="#/">Back to notes</a>
      </div>
    `;
    return;
  }

  view.innerHTML = `
    <div class="status">
      <h2>Loading ${escapeHtml(post.title)}</h2>
      <p>Fetching Markdown from <code>${escapeHtml(post.file)}</code>.</p>
    </div>
  `;

  try {
    const response = await fetch(post.file, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load ${post.file}: ${response.status}`);
    }

    const markdown = stripDuplicateTitle(stripFrontMatter(await response.text()), post.title);
    document.title = `${post.title} | Prem Writes`;
    view.innerHTML = `
      <article class="article-shell">
        <div class="article-top">
          <a class="back-link" href="#/">Back to notes</a>
          <div class="meta">
            <span>${formatDate(post.date)}</span>
            <span>${escapeHtml(post.readingTime)}</span>
          </div>
          <h1 class="article-title">${escapeHtml(post.title)}</h1>
          <p class="article-description">${escapeHtml(post.description)}</p>
          <div class="post-card-tags">
            ${post.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
        ${
          post.cover
            ? `<div class="article-cover"><img src="${escapeAttribute(post.cover)}" alt="" /></div>`
            : ""
        }
        <div class="article">${markdownToHtml(markdown)}</div>
      </article>
    `;
  } catch (error) {
    console.error(error);
    view.innerHTML = `
      <div class="status">
        <h2>Could not load this post</h2>
        <p>Check that <code>${escapeHtml(post.file)}</code> exists and is listed correctly.</p>
        <a class="back-link" href="#/">Back to notes</a>
      </div>
    `;
  }
}

function markdownToHtml(markdown) {
  if (!window.marked || !window.DOMPurify) {
    return basicMarkdownToHtml(markdown);
  }

  const headingIds = new Map();
  const renderer = new marked.Renderer();

  renderer.heading = (text, level, raw) => {
    const { id } = getHeadingParts(String(raw || text), headingIds);
    const cleanText = String(text)
      .replace(/<a\s+name=["']?[^"'>\s]+["']?\s*><\/a>/gi, "")
      .trim();

    return `<h${level} id="${escapeAttribute(id)}">${cleanText}</h${level}>`;
  };

  const html = marked.parse(markdown, {
    renderer,
    gfm: true,
    breaks: false,
    headerIds: false,
    mangle: false,
  });

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}

function basicMarkdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listItems = [];
  let listTag = "ul";
  let inCodeBlock = false;
  let codeLines = [];
  const headingIds = new Map();

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${parseInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length) {
      html.push(
        `<${listTag}>${listItems.map((item) => `<li>${parseInline(item)}</li>`).join("")}</${listTag}>`,
      );
      listItems = [];
      listTag = "ul";
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        inCodeBlock = false;
        codeLines = [];
      } else {
        flushParagraph();
        flushList();
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushList();
      html.push("<hr />");
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const { text, id } = getHeadingParts(heading[2], headingIds);
      html.push(`<h${level} id="${escapeAttribute(id)}">${parseInline(text)}</h${level}>`);
      return;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      flushParagraph();
      flushList();
      html.push(
        `<img src="${escapeAttribute(image[2])}" alt="${escapeAttribute(image[1])}" loading="lazy" />`,
      );
      return;
    }

    if (line.startsWith("> ")) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${parseInline(line.slice(2))}</blockquote>`);
      return;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listItems.length && listTag !== "ul") {
        flushList();
      }
      listTag = "ul";
      listItems.push(unordered[1]);
      return;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listItems.length && listTag !== "ol") {
        flushList();
      }
      listTag = "ol";
      listItems.push(ordered[1]);
      return;
    }

    paragraph.push(line.trim());
  });

  flushParagraph();
  flushList();

  if (inCodeBlock) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  return html.join("\n");
}

function parseInline(value) {
  let html = escapeHtml(value);
  const codeTokens = [];

  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });

  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (match, text, href) => {
        if (!isSafeUrl(href)) {
          return text;
        }

        return `<a href="${href}">${text}</a>`;
      },
    );

  codeTokens.forEach((token, index) => {
    html = html.replace(`@@CODE${index}@@`, token);
  });

  return html;
}

function stripFrontMatter(markdown) {
  return markdown.replace(/^---[\s\S]*?---\s*/, "");
}

function stripDuplicateTitle(markdown, title) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^#\\s+${escapedTitle}\\s*\\n+`, "i");
  return markdown.replace(pattern, "");
}

function getHeadingParts(rawHeading, headingIds) {
  const explicitAnchor = rawHeading.match(/<a\s+name=["']?([^"'>\s]+)["']?\s*><\/a>/i);
  const text = rawHeading.replace(/<a\s+name=["']?[^"'>\s]+["']?\s*><\/a>/gi, "").trim();
  const baseId = explicitAnchor ? explicitAnchor[1] : slugify(text);
  const count = headingIds.get(baseId) || 0;
  headingIds.set(baseId, count + 1);

  return {
    text,
    id: count ? `${baseId}-${count + 1}` : baseId,
  };
}

function isSafeUrl(value) {
  if (/^(https?:\/\/|#|\/|\.\/|\.\.\/)/i.test(value)) {
    return true;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return false;
  }

  return /^[^\s"'<>`]+$/.test(value);
}

function clearFilters() {
  state.query = "";
  state.tag = "";
  searchInput.value = "";
  renderTagFilters();
  renderHome();
}

function formatDate(date) {
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
