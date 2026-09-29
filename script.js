(function () {
  "use strict";

  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  /* Theme */
  const savedTheme = safeGet("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
    root.setAttribute("data-theme", "dark");
  }
  $("themeToggle").addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    safeSet("theme", next);
  });

  /* Reading time (about 200 words per minute) */
  const words = $("articleBody").innerText.trim().split(/\s+/).length;
  $("readTime").textContent = Math.max(1, Math.ceil(words / 200)) + " min read";

  /* Reading progress bar */
  const bar = $("progress");
  function updateProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    bar.style.width = Math.min(100, pct) + "%";
  }
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
  updateProgress();

  /* Claps */
  let claps = parseInt(safeGet("claps") || "0", 10) || 0;
  const buttons = [$("clapBtn"), $("clapBtn2")];
  const counts = [$("clapCount"), $("clapCount2")];

  function renderClaps() {
    counts.forEach((el) => (el.textContent = claps));
    buttons.forEach((btn) => btn.classList.toggle("active", claps > 0));
  }
  buttons.forEach((btn) =>
    btn.addEventListener("click", () => {
      if (claps >= 50) return;
      claps += 1;
      safeSet("claps", String(claps));
      renderClaps();
      buttons.forEach((b) => {
        b.classList.remove("pop");
        void b.offsetWidth; // restart animation
        b.classList.add("pop");
      });
    })
  );
  renderClaps();

  /* Copy link */
  const toast = $("toast");
  let toastTimer;
  function showToast(message) {
    toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.textContent = ""), 2000);
  }
  $("shareBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied");
    } catch (e) {
      showToast("Couldn't copy the link");
    }
  });

  /* ── Supabase Comments ── */
  const SUPABASE_URL = "https://xovhxvectqcpciuaueby.supabase.co";
  const SUPABASE_KEY = "sb_publishable_-l4JKcjNc6Al0hNGt6T9BA_LBePl20k";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const commentForm = $("commentForm");
  const commentName = $("commentName");
  const commentContent = $("commentContent");
  const commentSubmit = $("commentSubmit");
  const commentsList = $("commentsList");
  const commentsLoading = $("commentsLoading");
  const commentsCount = $("commentsCount");

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  function timeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    const intervals = [
      { label: "year",   s: 31536000 },
      { label: "month",  s: 2592000 },
      { label: "week",   s: 604800 },
      { label: "day",    s: 86400 },
      { label: "hour",   s: 3600 },
      { label: "minute", s: 60 },
    ];
    for (const i of intervals) {
      const count = Math.floor(seconds / i.s);
      if (count >= 1) return count + " " + i.label + (count > 1 ? "s" : "") + " ago";
    }
    return "just now";
  }

  function getInitials(name) {
    return name.split(" ").map(function(w) { return w[0]; }).join("").toUpperCase().slice(0, 2);
  }

  function avatarColor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return "hsl(" + (Math.abs(hash) % 360) + ", 55%, 50%)";
  }

  function renderComment(c, prepend) {
    const div = document.createElement("div");
    div.className = "comment-card" + (prepend ? " comment-new" : "");
    div.innerHTML =
      '<div class="comment-avatar" style="background:' + avatarColor(c.name) + '">' + getInitials(c.name) + '</div>' +
      '<div class="comment-body">' +
        '<div class="comment-header">' +
          '<span class="comment-author">' + escapeHtml(c.name) + '</span>' +
          '<span class="comment-time">' + timeAgo(c.created_at) + '</span>' +
        '</div>' +
        '<p class="comment-text">' + escapeHtml(c.content) + '</p>' +
      '</div>';
    if (prepend) commentsList.prepend(div);
    else commentsList.appendChild(div);
  }

  async function loadComments() {
    try {
      const { data, error } = await sb
        .from("comments")
        .select("*")
        .order("created_at", { ascending: false });

      commentsLoading.style.display = "none";
      if (error) throw error;

      commentsCount.textContent = "(" + data.length + ")";
      if (data.length === 0) {
        commentsList.innerHTML = '<p class="comments-empty">No comments yet. Be the first to share your thoughts!</p>';
        return;
      }
      commentsList.innerHTML = "";
      data.forEach(function(c) { renderComment(c, false); });
    } catch (err) {
      commentsLoading.innerHTML = '<p class="comments-error">Could not load comments.</p>';
      console.error("Load comments error:", err);
    }
  }

  commentForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const name = commentName.value.trim();
    const content = commentContent.value.trim();
    if (!name || !content) return;

    commentSubmit.disabled = true;
    commentSubmit.textContent = "Posting...";

    try {
      const { data, error } = await sb
        .from("comments")
        .insert([{ name: name, content: content }])
        .select();

      if (error) throw error;

      const empty = commentsList.querySelector(".comments-empty");
      if (empty) empty.remove();

      renderComment(data[0], true);

      const n = parseInt((commentsCount.textContent || "0").replace(/\D/g, ""), 10);
      commentsCount.textContent = "(" + (n + 1) + ")";

      commentForm.reset();
      safeSet("commenterName", name);
      showToast("Comment posted!");
    } catch (err) {
      showToast("Failed to post comment");
      console.error("Post comment error:", err);
    } finally {
      commentSubmit.disabled = false;
      commentSubmit.textContent = "Post Comment";
    }
  });

  /* Restore saved commenter name */
  const savedName2 = safeGet("commenterName");
  if (savedName2) commentName.value = savedName2;

  loadComments();
})();
