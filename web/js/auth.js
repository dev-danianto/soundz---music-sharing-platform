// ===== STATE =====
let isSignUp = false;

// ===== UTILS =====
function showMessage(message, type) {
  const msgDiv = document.getElementById("msg");
  msgDiv.className = "hidden p-4 rounded-lg mb-6 text-sm border";

  if (type === "success") {
    msgDiv.classList.add(
      "bg-green-500/20",
      "border-green-500/50",
      "text-green-200"
    );
  } else if (type === "error") {
    msgDiv.classList.add("bg-red-500/20", "border-red-500/50", "text-red-200");
  } else {
    msgDiv.classList.add(
      "bg-blue-500/20",
      "border-blue-500/50",
      "text-blue-200"
    );
  }

  msgDiv.textContent = message;
  msgDiv.classList.remove("hidden");
}

function clearMessage() {
  document.getElementById("msg").classList.add("hidden");
}

function toggleMode() {
  isSignUp = !isSignUp;
  const form = document.getElementById("form");
  const authTitle = document.getElementById("authTitle");
  const authSubtitle = document.getElementById("authSubtitle");
  const emailDiv = document.getElementById("emailDiv");
  const confirmDiv = document.getElementById("confirmDiv");
  const submitText = document.getElementById("submitText");
  const toggleText = document.getElementById("toggleText");

  if (isSignUp) {
    authTitle.textContent = "Create Account";
    authSubtitle.textContent = "Join us and start enjoying music";
    emailDiv.classList.remove("hidden");
    confirmDiv.classList.remove("hidden");
    submitText.textContent = "Sign Up";
    toggleText.textContent = "Already have an account? Sign in";
  } else {
    authTitle.textContent = "Welcome Back";
    authSubtitle.textContent = "Sign in to continue";
    emailDiv.classList.add("hidden");
    confirmDiv.classList.add("hidden");
    submitText.textContent = "Sign In";
    toggleText.textContent = "Don't have an account? Sign up";
  }

  clearMessage();
  form.reset();
}

// ===== MAIN AUTH =====
async function handleAuth(event) {
  event.preventDefault();
  clearMessage();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const email = document.getElementById("email").value.trim();
  const confirm = document.getElementById("confirm").value;

  if (!username || !password) {
    showMessage("⚠️ Username dan password wajib diisi", "error");
    return;
  }

  if (isSignUp) {
    if (!email) {
      showMessage("⚠️ Email wajib diisi", "error");
      return;
    }
    if (password !== confirm) {
      showMessage("⚠️ Password tidak cocok", "error");
      return;
    }
    if (password.length < 6) {
      showMessage("⚠️ Password minimal 6 karakter", "error");
      return;
    }

    try {
      showMessage("📝 Registrasi sedang diproses...", "info");
      const result = await eel.register_user(username, email, password)();

      if (result.status === "success") {
        showMessage(`✅ Registrasi berhasil! ID: ${result.user_id}`, "success");
        form.reset();
        setTimeout(() => toggleMode(), 2000);
      } else {
        showMessage(`❌ ${result.message || "Registrasi gagal"}`, "error");
      }
    } catch (error) {
      console.error("Register error:", error);
      showMessage("❌ Server error, coba lagi", "error");
    }
  } else {
    try {
      showMessage("🔐 Login sedang diproses...", "info");
      const result = await eel.login_user(username, password)();

      if (result.status === "success") {
        showMessage(
          `✅ Login berhasil! Selamat datang ${result.data.username}`,
          "success"
        );

        localStorage.setItem("user_id", result.data.user_id);
        localStorage.setItem("username", result.data.username);
        localStorage.setItem("email", result.data.email);

        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 1500);
      } else {
        showMessage("❌ Username atau password salah", "error");
      }
    } catch (error) {
      console.error("Login error:", error);
      showMessage("❌ Koneksi server gagal", "error");
    }
  }
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ Auth page loaded");
  if (typeof eel === "undefined") {
    showMessage("⚠️ Server tidak tersedia. Refresh halaman.", "error");
    console.error("❌ Eel not available");
  } else {
    console.log("✅ Eel ready");
  }
});
