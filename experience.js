/* Hide the mobile quick link when the form is already in view. */
(() => {
  const section = document.getElementById("eligibility-check");
  if (!section || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(entries => {
    for (const entry of entries) document.body.classList.toggle("form-in-view", entry.isIntersecting);
  }, { threshold: 0, rootMargin: "-8% 0px -8% 0px" }).observe(section);
})();
