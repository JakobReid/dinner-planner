// Drag a planned night onto another night to swap the two. A mouse drags as soon as it moves;
// a finger has to hold still for a moment first, so an ordinary swipe still scrolls the page.
const HOLD = 350; // ms a finger rests before the meal lifts
const SLOP = 8; // px of movement that makes a press a drag (mouse) or a scroll (finger)
const EDGE = 70; // px from the top or bottom of the screen where dragging scrolls the page

export function initDrag(box, onDrop) {
  let s = null; // the press in progress
  let ate = false; // swallow the click that ends a drag

  const row = (day) => box.querySelector(`.day[data-day="${day}"]`);
  const under = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    const r = hit && hit.closest(".day");
    return r && box.contains(r) ? r.dataset.day : null;
  };
  const mark = (day) => {
    if (s.over === day) return;
    box.querySelectorAll(".drop").forEach((r) => r.classList.remove("drop"));
    s.over = day;
    if (day && day !== s.day) row(day).classList.add("drop");
  };
  const place = (y) =>
    (s.ghost.style.transform = `translate(${s.left}px, ${y - s.ghost.offsetHeight / 2}px) rotate(-2deg)`);

  function lift() {
    const from = row(s.day);
    if (!from) return stop();
    s.on = true;
    const m = from.querySelector(".m");
    s.left = m.getBoundingClientRect().left;
    s.ghost = document.createElement("div");
    s.ghost.className = "dragghost";
    s.ghost.textContent = m.textContent;
    document.body.append(s.ghost);
    from.classList.add("lifted");
    document.body.classList.add("dragging");
    place(s.y);
    if (s.touch && navigator.vibrate) navigator.vibrate(10);
  }
  function stop() {
    if (!s) return;
    clearTimeout(s.timer);
    if (s.ghost) s.ghost.remove();
    box.querySelectorAll(".drop, .lifted").forEach((r) => r.classList.remove("drop", "lifted"));
    document.body.classList.remove("dragging");
    s = null;
  }

  box.addEventListener("pointerdown", (e) => {
    const r = e.target.closest(".day[data-has]");
    if (!r || !e.isPrimary || e.button !== 0) return;
    stop();
    s = {
      day: r.dataset.day,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      touch: e.pointerType !== "mouse",
      on: false,
    };
    if (s.touch) s.timer = setTimeout(lift, HOLD);
  });
  addEventListener("pointermove", (e) => {
    if (!s || e.pointerId !== s.id) return;
    if (!s.on) {
      const far = Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP;
      if (!far) return;
      if (s.touch) return stop(); // moved before the hold was up: that's a scroll
      s.y = e.clientY;
      lift();
      if (!s) return;
    }
    place(e.clientY);
    mark(under(e.clientX, e.clientY));
    if (e.clientY < EDGE) scrollBy(0, -12);
    else if (e.clientY > innerHeight - EDGE) scrollBy(0, 12);
  });
  addEventListener("pointerup", (e) => {
    if (!s || e.pointerId !== s.id) return;
    const { on, day } = s;
    const to = on ? under(e.clientX, e.clientY) : null;
    stop();
    if (!on) return;
    ate = true;
    setTimeout(() => (ate = false), 80);
    if (to && to !== day) onDrop(day, to);
  });
  addEventListener("pointercancel", (e) => s && e.pointerId === s.id && stop());
  addEventListener("keydown", (e) => e.key === "Escape" && stop());
  // once a meal is lifted the finger moves the meal, not the page
  box.addEventListener("touchmove", (e) => s && s.on && e.cancelable && e.preventDefault(), { passive: false });
  box.addEventListener("contextmenu", (e) => s && e.preventDefault());
  box.addEventListener(
    "click",
    (e) => {
      if (!ate) return;
      ate = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
}
