(() => {
  const form = document.querySelector("#niv-enquiry-form");
  if (!form) return;
  const status = document.querySelector("#enquiry-status");
  const submit = form.querySelector('button[type="submit"]');
  const currency = document.querySelector("#enquiry-currency");
  const otherWrap = document.querySelector("#enquiry-other-currency-wrap");
  const otherInput = document.querySelector("#enquiry-other-currency");
  const resumeInput = document.querySelector("#enquiry-resume");
  const linkedInInput = document.querySelector("#enquiry-linkedin");
  const maxResumeBytes = 2 * 1024 * 1024;
  const allowed = ["pdf", "doc", "docx"];
  const setStatus = (message, type) => {
    status.hidden = false;
    status.className = "form-status " + (type === "success" ? "form-status--success" : "form-status--error");
    status.textContent = message;
    status.focus({ preventScroll: true });
  };
  const syncCurrency = () => {
    const other = currency.value === "OTHER";
    otherWrap.hidden = !other;
    otherInput.required = other;
    if (!other) otherInput.value = "";
  };
  currency.addEventListener("change", syncCurrency);
  syncCurrency();
  const encodeFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("We couldn't read the CV file. Please try again."));
    reader.readAsDataURL(file);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.hidden = true;
    if (!form.reportValidity()) return;
    const resume = resumeInput.files && resumeInput.files[0];
    if (!linkedInInput.value.trim() && !resume) {
      setStatus("Please add your LinkedIn profile or attach a CV / résumé.", "error");
      linkedInInput.focus();
      return;
    }
    if (resume) {
      const extension = resume.name.split(".").pop().toLowerCase();
      if (!allowed.includes(extension) || resume.size > maxResumeBytes || !resume.size) {
        setStatus("Please attach a PDF, DOC or DOCX CV under 2 MB, or use your LinkedIn link instead.", "error");
        resumeInput.focus();
        return;
      }
    }
    if (linkedInInput.value.trim()) {
      try {
        const url = new URL(linkedInInput.value.trim());
        if (url.protocol !== "https:" || !["linkedin.com", "www.linkedin.com"].includes(url.hostname)) {
          throw new Error("invalid linkedin");
        }
      } catch {
        setStatus("Please enter a complete LinkedIn profile URL starting with https://www.linkedin.com/.", "error");
        linkedInInput.focus();
        return;
      }
    }
    submit.disabled = true;
    submit.textContent = "Sending your enquiry…";
    try {
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      delete payload.resume;
      payload.consent = document.querySelector("#enquiry-consent").checked;
      payload.salary = fd.get("salary");
      payload.website = fd.get("website") || "";
      if (resume) payload.resume = { name: resume.name, data: await encodeFile(resume) };
      const response = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || "The form could not be submitted. Please try again or email info@anzinnovate.com.");
      }
      form.reset();
      syncCurrency();
      setStatus("Thank you. Your enquiry has been sent to ANZInnovate. We will contact you using the details supplied.", "success");
    } catch (error) {
      setStatus(error.message || "The form could not be submitted. Please email info@anzinnovate.com.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Send my eligibility enquiry";
    }
  });
})();
