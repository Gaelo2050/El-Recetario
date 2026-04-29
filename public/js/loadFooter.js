fetch("/views/partials/footer.html")
  .then(res => res.text())
  .then(html => {
    document.getElementById("footerContainer").innerHTML = html;
  });