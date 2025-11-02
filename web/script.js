// Deteksi apakah running di Eel atau browser biasa
function isRunningInEel() {
  return typeof window.eel !== "undefined";
}

// Gunakan untuk menampilkan/menyembunyikan elemen
if (isRunningInEel()) {
  console.log("✓ Running di Eel Application");
  document.body.style.backgroundColor = "#f3e5e5"; // Warna khusus Eel

  // Tampilkan elemen yang hanya untuk Eel
  const eelOnlyElements = document.querySelectorAll(".eel-only");
  eelOnlyElements.forEach((el) => (el.style.display = "block"));

  // Sembunyikan elemen untuk browser biasa
  const webOnlyElements = document.querySelectorAll(".web-only");
  webOnlyElements.forEach((el) => (el.style.display = "none"));
} else {
  console.log("✓ Running di Browser Biasa");

  // Sembunyikan elemen yang hanya untuk Eel
  const eelOnlyElements = document.querySelectorAll(".eel-only");
  eelOnlyElements.forEach((el) => (el.style.display = "none"));

  // Tampilkan elemen untuk browser biasa
  const webOnlyElements = document.querySelectorAll(".web-only");
  webOnlyElements.forEach((el) => (el.style.display = "block"));
}
