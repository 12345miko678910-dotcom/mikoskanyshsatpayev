(function () {
  "use strict";

  const config = window.BOOK_CONFIG;
  const storageKeys = {
    page: "qanysh-reader-page",
    bookmarks: "qanysh-reader-bookmarks",
    theme: "qanysh-reader-theme"
  };
  const state = {
    page: 1,
    theme: "light",
    spread: false,
    panel: "chapters",
    controlsVisible: true,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    pointers: new Map(),
    startPoint: null,
    pinchDistance: 0,
    pinchScale: 1,
    hideTimer: 0,
    hintTimer: 0,
    viewMode: "text",
    textRequest: 0
  };
  const el = {};
  const byId = (id) => document.getElementById(id);

  function init() {
    if (!config || !Number.isInteger(config.pageCount) || config.pageCount < 1) {
      throw new Error("config.js ішінде pageCount мәні дұрыс көрсетілмеген.");
    }
    [
      "home", "reader", "book-title", "book-author", "book-description", "page-count-label",
      "start-reading", "continue-reading", "share-home", "reader-title", "back-home",
      "toc-toggle", "toc-panel", "toc-close", "panel-backdrop", "chapters-list", "bookmarks-list",
      "text-toggle", "book-text-page", "book-text-content", "book-text-page-number",
      "bookmark-toggle", "theme-toggle", "fullscreen-toggle", "toolbar-share", "reader-stage",
      "page-spread", "page-image", "second-frame", "second-image", "load-error", "previous-page",
      "next-page", "previous-text", "next-text", "page-slider", "current-page-label",
      "page-form", "page-input", "spread-toggle", "reader-toolbar", "reader-controls",
      "reader-hint", "live-message"
    ].forEach((id) => { el[id] = byId(id); });

    document.title = config.title + " — онлайн кітап";
    document.querySelector('meta[name="description"]').content = config.description;
    document.querySelector('meta[property="og:title"]').content = config.title;
    document.querySelector('meta[property="og:description"]').content = config.description;
    document.querySelector('meta[property="og:image"]').content = new URL(config.cover, document.baseURI).href;
    document.documentElement.style.setProperty("--accent", config.colors.accent);
    el["book-title"].textContent = config.title;
    el["book-author"].textContent = config.author;
    el["book-description"].textContent = config.description;
    el["reader-title"].textContent = config.title;
    el["page-count-label"].textContent = config.pageCount + " бет";
    el["page-slider"].max = String(config.pageCount);
    el["page-input"].max = String(config.pageCount);

    const savedPage = Number(localStorage.getItem(storageKeys.page));
    if (Number.isInteger(savedPage) && savedPage >= 1 && savedPage <= config.pageCount) {
      el["continue-reading"].hidden = false;
    }
    el["continue-reading"].addEventListener("click", () => {
      const page = Number(localStorage.getItem(storageKeys.page));
      openReader(Number.isInteger(page) ? page : 1);
    });
    el["start-reading"].addEventListener("click", () => openReader(1));
    el["share-home"].addEventListener("click", shareBook);
    el["toolbar-share"].addEventListener("click", shareCurrentPage);
    el["back-home"].addEventListener("click", closeReader);
    el["previous-page"].addEventListener("click", () => changePage(-1));
    el["next-page"].addEventListener("click", () => changePage(1));
    el["previous-text"].addEventListener("click", () => changePage(-1));
    el["next-text"].addEventListener("click", () => changePage(1));
    el["page-slider"].addEventListener("input", (event) => goToPage(Number(event.target.value), false));
    el["page-slider"].addEventListener("change", () => saveProgress());
    el["page-form"].addEventListener("submit", (event) => {
      event.preventDefault();
      const page = Number(el["page-input"].value);
      if (Number.isInteger(page) && page >= 1 && page <= config.pageCount) {
        goToPage(page);
        el["page-input"].value = "";
      } else {
        announce("1 мен " + config.pageCount + " аралығындағы бетті енгізіңіз.");
      }
    });
    el["bookmark-toggle"].addEventListener("click", toggleBookmark);
    el["theme-toggle"].addEventListener("click", cycleTheme);
    el["fullscreen-toggle"].addEventListener("click", toggleFullscreen);
    el["spread-toggle"].addEventListener("click", toggleSpread);
    el["toc-toggle"].addEventListener("click", () => showPanel("chapters"));
    el["toc-close"].addEventListener("click", closePanel);
    el["panel-backdrop"].addEventListener("click", closePanel);
    el["text-toggle"].addEventListener("click", toggleReadingMode);
    document.querySelectorAll(".panel-tab").forEach((tab) => tab.addEventListener("click", () => showPanel(tab.dataset.panel)));

    const savedTheme = localStorage.getItem(storageKeys.theme);
    setTheme(["light", "dark", "sepia"].includes(savedTheme) ? savedTheme : "light");
    loadContents();
    setupGestures();
    document.addEventListener("keydown", handleKeys);
    el["reader"].addEventListener("pointerdown", revealControls);
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    window.addEventListener("hashchange", readHash);

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js").catch((error) => console.error("Service worker registration failed:", error));
    }
    readHash();
  }

  function pageUrl(page) {
    const mappedPage = config.scanPages && config.scanPages[String(page)];
    if (mappedPage) return config.pageDirectory.replace(/\/$/, "") + "/" + mappedPage;
    const extension = config.pageFormat.replace(/^\./, "");
    const name = String(page).padStart(3, "0") + "." + extension;
    return config.pageDirectory.replace(/\/$/, "") + "/" + name;
  }

  function loadPage(image, page) {
    const frame = image.parentElement;
    const skeleton = frame.querySelector(".page-skeleton");
    image.classList.remove("loaded");
    if (skeleton) skeleton.hidden = false;
    image.onload = () => {
      image.classList.add("loaded");
      if (skeleton) skeleton.hidden = true;
      el["load-error"].hidden = true;
    };
    image.onerror = () => {
      image.classList.remove("loaded");
      if (skeleton) skeleton.hidden = true;
      el["load-error"].hidden = false;
    };
    image.alt = "Кітап беті " + page;
    image.src = pageUrl(page);
  }

  function renderPages() {
    const first = state.page;
    const showText = state.viewMode === "text";
    const showSpread = !showText && state.spread && window.matchMedia("(min-width: 900px)").matches;
    el["reader"].dataset.readingMode = state.viewMode;
    el["page-image"].hidden = showText;
    el["book-text-page"].hidden = !showText;
    if (showText) loadPageText(first);
    else loadPage(el["page-image"], first);
    const second = showSpread && first < config.pageCount;
    el["second-frame"].hidden = !second;
    el["reader"].dataset.spread = String(showSpread);
    if (second) loadPage(el["second-image"], first + 1);
    if (!showText) preloadNeighbors(first, second);
    el["current-page-label"].textContent = state.spread && second
      ? first + "–" + (first + 1) + " / " + config.pageCount
      : first + " / " + config.pageCount;
    el["page-slider"].value = String(first);
    el["page-input"].max = String(config.pageCount);
    el["bookmark-toggle"].textContent = getBookmarks().includes(first) ? "★" : "☆";
    el["bookmark-toggle"].classList.toggle("is-active", getBookmarks().includes(first));
    el["previous-page"].disabled = first <= 1;
    el["previous-text"].disabled = first <= 1;
    el["next-page"].disabled = first >= config.pageCount;
    el["next-text"].disabled = first >= config.pageCount;
    el["load-error"].hidden = true;
    resetZoom();
  }

  function preloadNeighbors(first, second) {
    const pages = [first - 1, first + (second ? 2 : 1)];
    pages.forEach((page) => {
      if (page < 1 || page > config.pageCount) return;
      const image = new Image();
      image.src = pageUrl(page);
    });
  }

  function openReader(page) {
    state.page = boundedPage(page);
    el["home"].hidden = true;
    el["reader"].hidden = false;
    document.body.style.overflow = "hidden";
    renderPages();
    saveProgress();
    updateHash();
    showHint();
  }

  function closeReader() {
    el["reader"].hidden = true;
    el["home"].hidden = false;
    document.body.style.overflow = "";
    history.replaceState(null, "", location.pathname + location.search);
  }

  function boundedPage(page) {
    return Math.max(1, Math.min(config.pageCount, Math.round(page)));
  }

  function goToPage(page, save) {
    const next = boundedPage(page);
    if (next === state.page && el["reader"].hidden) return;
    state.page = next;
    renderPages();
    if (save !== false) saveProgress();
    updateHash();
  }

  function changePage(direction) {
    const step = state.spread && window.matchMedia("(min-width: 900px)").matches ? 2 : 1;
    goToPage(state.page + direction * step);
  }

  function saveProgress() {
    localStorage.setItem(storageKeys.page, String(state.page));
    el["continue-reading"].hidden = false;
  }

  function readHash() {
    const match = location.hash.match(/^#page=(\d+)$/);
    if (!match) return;
    const page = Number(match[1]);
    if (page >= 1 && page <= config.pageCount) {
      if (el["reader"].hidden) openReader(page);
      else goToPage(page);
    }
  }

  function updateHash() {
    history.replaceState(null, "", "#page=" + state.page);
  }

  function getBookmarks() {
    try {
      const bookmarks = JSON.parse(localStorage.getItem(storageKeys.bookmarks) || "[]");
      return Array.isArray(bookmarks) ? bookmarks.filter((page) => Number.isInteger(page) && page >= 1 && page <= config.pageCount) : [];
    } catch (error) {
      console.error("Could not read bookmarks:", error);
      return [];
    }
  }

  function toggleBookmark() {
    const bookmarks = getBookmarks();
    const index = bookmarks.indexOf(state.page);
    if (index === -1) bookmarks.push(state.page);
    else bookmarks.splice(index, 1);
    bookmarks.sort((a, b) => a - b);
    localStorage.setItem(storageKeys.bookmarks, JSON.stringify(bookmarks));
    renderPages();
    if (!el["toc-panel"].hidden && state.panel === "bookmarks") renderBookmarks();
    announce(index === -1 ? state.page + "-бет бетбелгіге қосылды." : "Бетбелгі алынды.");
  }

  function loadContents() {
    fetch("./toc.json")
      .then((response) => {
        if (!response.ok) throw new Error("toc.json жүктелмеді: HTTP " + response.status);
        return response.json();
      })
      .then((data) => renderChapters(data.chapters))
      .catch((error) => {
        console.error(error);
        el["chapters-list"].innerHTML = '<p class="panel-empty">Мазмұн әзірге қосылмаған.</p>';
      });
  }

  function renderChapters(chapters) {
    el["chapters-list"].replaceChildren();
    if (!Array.isArray(chapters) || chapters.length === 0) {
      el["chapters-list"].innerHTML = '<p class="panel-empty">Бөлімдер тізімі toc.json файлына енгізілгенде осында көрсетіледі.</p>';
      return;
    }
    chapters.forEach((chapter) => {
      if (!chapter || typeof chapter.title !== "string" || !Number.isInteger(Number(chapter.page))) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "panel-item";
      button.innerHTML = "<span></span><small></small>";
      button.querySelector("span").textContent = chapter.title;
      button.querySelector("small").textContent = chapter.page + "-бет";
      button.addEventListener("click", () => {
        goToPage(Number(chapter.page));
        closePanel();
      });
      el["chapters-list"].append(button);
    });
  }

  function renderBookmarks() {
    el["bookmarks-list"].replaceChildren();
    const bookmarks = getBookmarks();
    if (!bookmarks.length) {
      el["bookmarks-list"].innerHTML = '<p class="panel-empty">Әзірге бетбелгі жоқ. Қажетті бетте ☆ батырмасын басыңыз.</p>';
      return;
    }
    bookmarks.forEach((page) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "panel-item";
      button.innerHTML = "<span></span><small>Өту →</small>";
      button.querySelector("span").textContent = "Кітаптың " + page + "-беті";
      button.addEventListener("click", () => {
        goToPage(page);
        closePanel();
      });
      el["bookmarks-list"].append(button);
    });
  }

  function showPanel(panel) {
    state.panel = panel;
    el["toc-panel"].hidden = false;
    el["panel-backdrop"].hidden = false;
    document.querySelectorAll(".panel-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.panel === panel));
    el["chapters-list"].hidden = panel !== "chapters";
    el["bookmarks-list"].hidden = panel !== "bookmarks";
    if (panel === "bookmarks") renderBookmarks();
  }

  function closePanel() {
    el["toc-panel"].hidden = true;
    el["panel-backdrop"].hidden = true;
  }

  function toggleReadingMode() {
    state.viewMode = state.viewMode === "text" ? "scan" : "text";
    const showText = state.viewMode === "text";
    el["text-toggle"].textContent = showText ? "Скан" : "Аа";
    el["text-toggle"].title = showText ? "Сканды көрсету" : "Мәтінді көрсету";
    el["text-toggle"].setAttribute("aria-label", el["text-toggle"].title);
    el["text-toggle"].classList.toggle("is-active", showText);
    renderPages();
  }

  async function loadPageText(page) {
    const request = ++state.textRequest;
    const name = String(page).padStart(3, "0") + ".txt";
    el["book-text-content"].className = "book-text-content";
    el["book-text-content"].textContent = "Мәтін жүктелуде…";
    el["book-text-page-number"].textContent = String(page);
    try {
      const response = await fetch("./text/" + name);
      if (request !== state.textRequest) return;
      if (response.status === 404) {
        el["book-text-content"].className = "book-text-content book-text-empty";
        el["book-text-content"].textContent = "Бұл бетке мәтіндік нұсқа әлі қосылмаған.";
        return;
      }
      if (!response.ok) throw new Error("text/" + name + " жүктелмеді: HTTP " + response.status);
      const text = (await response.text()).trim();
      if (request !== state.textRequest) return;
      el["book-text-content"].className = text ? "book-text-content" : "book-text-content book-text-empty";
      el["book-text-content"].textContent = text || "Бұл бетте мәтін жоқ.";
    } catch (error) {
      if (request !== state.textRequest) return;
      console.error(error);
      el["book-text-content"].className = "book-text-content book-text-empty";
      el["book-text-content"].textContent = "Мәтінді жүктеу мүмкін болмады. Интернет байланысын тексеріңіз.";
    }
  }

  function setTheme(theme) {
    state.theme = theme;
    el["reader"].dataset.theme = theme;
    const labels = { light: "Ашық тақырып", dark: "Қараңғы тақырып", sepia: "Сепия тақырыбы" };
    el["theme-toggle"].title = labels[theme];
    el["theme-toggle"].setAttribute("aria-label", labels[theme]);
    localStorage.setItem(storageKeys.theme, theme);
  }

  function cycleTheme() {
    const themes = ["light", "dark", "sepia"];
    setTheme(themes[(themes.indexOf(state.theme) + 1) % themes.length]);
  }

  function toggleSpread() {
    state.spread = !state.spread;
    el["spread-toggle"].setAttribute("aria-pressed", String(state.spread));
    renderPages();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      el["reader"].requestFullscreen().catch((error) => console.error("Fullscreen request failed:", error));
    } else {
      document.exitFullscreen().catch((error) => console.error("Could not exit fullscreen:", error));
    }
  }

  function updateFullscreenButton() {
    const active = Boolean(document.fullscreenElement);
    el["fullscreen-toggle"].textContent = active ? "⛶" : "⛶";
    el["fullscreen-toggle"].title = active ? "Толық экраннан шығу" : "Толық экран";
  }

  async function shareBook() {
    const shareData = { title: config.title, text: config.description, url: location.href.split("#")[0] };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareData.url);
        announce("Сілтеме көшірілді.");
      } else {
        window.prompt("Кітап сілтемесі:", shareData.url);
      }
    } catch (error) {
      if (error.name !== "AbortError") console.error("Could not share book:", error);
    }
  }

  async function shareCurrentPage() {
    const url = new URL(location.href);
    url.hash = "page=" + state.page;
    try {
      if (navigator.share) await navigator.share({ title: config.title, text: state.page + "-беттен оқу", url: url.href });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url.href);
        announce("Бет сілтемесі көшірілді.");
      } else {
        window.prompt("Бет сілтемесі:", url.href);
      }
    } catch (error) {
      if (error.name !== "AbortError") console.error("Could not share page:", error);
    }
  }

  function handleKeys(event) {
    if (el["reader"].hidden || event.altKey || event.ctrlKey || event.metaKey || event.target.matches("input")) return;
    if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); changePage(1); }
    else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); changePage(-1); }
    else if (event.key === "Escape" && !el["toc-panel"].hidden) closePanel();
    else if (event.key === "Escape" && !document.fullscreenElement) closeReader();
    else if (event.key === " " && event.target === document.body) { event.preventDefault(); toggleControls(); }
  }

  function setupGestures() {
    const stage = el["reader-stage"];
    stage.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      stage.setPointerCapture(event.pointerId);
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.pointers.size === 1) {
        state.startPoint = {
          x: event.clientX,
          y: event.clientY,
          time: Date.now(),
          controlsVisible: state.controlsVisible
        };
      } else if (state.pointers.size === 2) {
        state.pinchDistance = pointerDistance();
        state.pinchScale = state.zoom;
      }
    });
    stage.addEventListener("pointermove", (event) => {
      if (!state.pointers.has(event.pointerId)) return;
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.pointers.size >= 2) {
        const distance = pointerDistance();
        if (state.pinchDistance) setZoom(state.pinchScale * (distance / state.pinchDistance));
      } else if (state.zoom > 1 && state.startPoint) {
        state.offsetX += event.movementX;
        state.offsetY += event.movementY;
        applyTransform();
      }
    });
    const endPointer = (event) => {
      if (!state.pointers.has(event.pointerId)) return;
      state.pointers.delete(event.pointerId);
      if (state.pointers.size === 0 && state.startPoint) {
        const deltaX = event.clientX - state.startPoint.x;
        const deltaY = event.clientY - state.startPoint.y;
        const duration = Date.now() - state.startPoint.time;
        if (state.zoom === 1 && Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && duration < 900) {
          changePage(deltaX < 0 ? 1 : -1);
        } else if (state.zoom === 1 && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && duration < 400) {
          if (state.startPoint.controlsVisible) toggleControls();
          else scheduleHide();
        }
        state.startPoint = null;
      }
      if (state.pointers.size === 1) {
        const remaining = Array.from(state.pointers.values())[0];
        state.startPoint = {
          x: remaining.x,
          y: remaining.y,
          time: Date.now(),
          controlsVisible: state.controlsVisible
        };
      }
    };
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);
    stage.addEventListener("dblclick", (event) => {
      event.preventDefault();
      setZoom(state.zoom > 1 ? 1 : 2);
    });
    stage.addEventListener("wheel", (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom(state.zoom + (event.deltaY < 0 ? .15 : -.15));
    }, { passive: false });
  }

  function pointerDistance() {
    const points = Array.from(state.pointers.values());
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function setZoom(scale) {
    state.zoom = Math.max(1, Math.min(4, scale));
    if (state.zoom === 1) { state.offsetX = 0; state.offsetY = 0; }
    applyTransform();
  }

  function applyTransform() {
    el["page-spread"].style.transform = "translate(" + state.offsetX + "px, " + state.offsetY + "px) scale(" + state.zoom + ")";
  }

  function resetZoom() {
    state.zoom = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    if (el["page-spread"]) applyTransform();
  }

  function toggleControls() {
    state.controlsVisible = !state.controlsVisible;
    el["reader"].classList.toggle("ui-hidden", !state.controlsVisible);
    if (state.controlsVisible) scheduleHide();
    else window.clearTimeout(state.hideTimer);
  }

  function revealControls() {
    if (!state.controlsVisible) {
      state.controlsVisible = true;
      el["reader"].classList.remove("ui-hidden");
    }
    scheduleHide();
  }

  function scheduleHide() {
    window.clearTimeout(state.hideTimer);
    if (!el["toc-panel"].hidden) return;
    state.hideTimer = window.setTimeout(() => {
      if (!el["reader"].hidden && el["toc-panel"].hidden) {
        state.controlsVisible = false;
        el["reader"].classList.add("ui-hidden");
      }
    }, 3500);
  }

  function showHint() {
    el["reader-hint"].classList.add("show");
    window.clearTimeout(state.hintTimer);
    state.hintTimer = window.setTimeout(() => el["reader-hint"].classList.remove("show"), 2600);
    state.controlsVisible = true;
    scheduleHide();
  }

  function announce(message) {
    el["live-message"].textContent = message;
  }

  init();
}());
