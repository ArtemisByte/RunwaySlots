  // ===== Win95 Name logic (kept from your original, adapted to new UI) =====
    const LS_KEY = "rb_username";

    function titleCaseName(str) {
      return (str || "")
        .trim()
        .replace(/\s+/g, " ")
        .split(" ")
        .map(s => s ? (s[0].toUpperCase() + s.slice(1)) : "")
        .join(" ");
    }
    function getGreetingForHour(h){
      if (h < 12) return "Good Morning";
      if (h < 16) return "Good Afternoon";
      return "Good Evening";
    }
    function setGreeting(name){
      const hour = new Date().getHours();
      const greet = getGreetingForHour(hour);
      document.getElementById("greeting").textContent = name ? `${greet}, ${name}` : greet;
    }

    function showOverlay(show){
      const overlay = document.getElementById("nameOverlay");
      if (show){
        overlay.classList.remove("hidden");
        setTimeout(() => document.getElementById("nameInput").focus(), 0);
      } else {
        overlay.classList.add("hidden");
      }
    }

    function saveNameFromInput(){
      const input = document.getElementById("nameInput");
      const err = document.getElementById("nameError");
      const clean = titleCaseName(input.value);

      if (!clean || clean.length < 2){
        err.textContent = "Please enter a valid name.";
        return;
      }
      try { localStorage.setItem(LS_KEY, clean); } catch(e){}
      err.textContent = "";
      setGreeting(clean);
      showOverlay(false);
    }

    // Bindings
    document.getElementById("saveNameBtn").addEventListener("click", saveNameFromInput);
    document.getElementById("cancelNameBtn").addEventListener("click", () => showOverlay(false));
    document.getElementById("closeDialog").addEventListener("click", () => showOverlay(false));

    document.getElementById("nameInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveNameFromInput();
      if (e.key === "Escape") showOverlay(false);
    });

    document.getElementById("changeName").addEventListener("click", () => {
      showOverlay(true);
      document.getElementById("nameInput").value = localStorage.getItem(LS_KEY) || "";
      document.getElementById("nameError").textContent = "";
    });

 (function init(){
  let name = "";
  try { name = localStorage.getItem(LS_KEY) || ""; } catch(e){}
  setGreeting(name);
  if (!name) {
    showOverlay(true);
  } else {
    showOverlay(false); 
  }
})();
