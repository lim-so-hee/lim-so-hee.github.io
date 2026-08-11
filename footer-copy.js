(() => {
  const topButton = document.querySelector(".back-to-top");
  if (topButton) {
    topButton.addEventListener("click", (event) => {
      event.preventDefault();
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: reduceMotion ? "auto" : "smooth"
      });
    });
  }

  const buttons = [...document.querySelectorAll("[data-copy-email]")];
  if (!buttons.length) return;

  const toast = document.createElement("div");
  toast.className = "email-copy-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.setAttribute("aria-atomic", "true");
  document.body.append(toast);

  let hideTimer;

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
  };

  const copyWithFallback = (text) => {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("copy command failed");
  };

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const email = button.dataset.copyEmail;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(email);
        } else {
          copyWithFallback(email);
        }
        showToast("이메일 주소를 복사했습니다.");
      } catch {
        try {
          copyWithFallback(email);
          showToast("이메일 주소를 복사했습니다.");
        } catch {
          showToast(`복사하지 못했습니다. 이메일: ${email}`);
        }
      }
    });
  });
})();
