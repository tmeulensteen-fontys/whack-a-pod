// Speelscherm (opendag.html): echte pods meppen via de admin-API.
(function () {
    var AANTAL = 12;
    var DUUR = parseInt(new URLSearchParams(location.search).get("duur"), 10) || 30;
    var STER_VANAF = 25;

    var $ = function (id) { return document.getElementById(id); };
    // Het speelscherm toont geen events; de log is alleen actief als er een #events-blok is.
    var log = $("events") ? new EventLog($("events"), 14) : { add: function () {}, clear: function () {} };
    var watcher = new PodWatcher(log);
    var snd = {
        mep: geluid("assets/audio/pop.wav"),
        boem: geluid("assets/audio/explosion.wav"),
        aftellen: geluid("assets/audio/countdown.mp3"),
        start: geluid("assets/audio/startup.mp3")
    };

    var staat = "idle";          // idle | starting | running | done
    var gemept = 0, plat = 0, gezien = {}, aantalGezien = 0;
    var eindTijd = 0, afgeteld = false, sterGetoond = false;
    var serviceDown = false, fails = 0, antwoorder = "";
    var geslagen = {};           // pods die net gemept zijn, tot ze echt weg zijn
    var stervend = {};           // naam -> moment waarop de pod terminating werd
    var slots = [], slotEls = [];
    var podTimer = null, serviceTimer = null, klokTimer = null;
    var podBezig = false, serviceBezig = false;
    var laatstePods = [];
    var laatsteCreate = 0;

    function punten() { return gemept + plat * 100; }

    function zetTijd(sec) {
        var m = Math.floor(sec / 60), s = sec % 60;
        $("tijd").textContent = m + ":" + (s < 10 ? "0" : "") + s;
    }

    function stopTimers() {
        clearInterval(podTimer); clearInterval(serviceTimer); clearInterval(klokTimer);
        podTimer = serviceTimer = klokTimer = null;
    }

    function resetUI() {
        gemept = 0; plat = 0; gezien = {}; aantalGezien = 0; geslagen = {}; stervend = {};
        afgeteld = false; sterGetoond = false; serviceDown = false; fails = 0; antwoorder = "";
        slots = []; slotEls = []; laatstePods = [];
        watcher.reset();
        $("veld").innerHTML = "";
        tekenPods([]);
        $("ster").hidden = true;
        $("plat").hidden = true;
        zetTijd(DUUR);
        toonStats([]);
    }

    function toonStats(pods) {
        var running = pods.filter(function (p) { return podStatus(p) === "running" && !geslagen[p.metadata.name]; }).length;
        $("gemept").textContent = gemept;
        $("running").textContent = running + "/" + AANTAL;
        $("hersteld").textContent = Math.max(0, aantalGezien - AANTAL);
        if (!sterGetoond && staat === "running" && punten() >= STER_VANAF) {
            sterGetoond = true;
            $("ster").hidden = false;
        }
    }

    // Elke pod houdt zijn eigen gat. Een vervanger neemt het gat over van een gemepte pod
    // zodra de MEP!-animatie voorbij is, zodat er altijd 12 gaten blijven.
    function tekenPods(pods) {
        var perNaam = {}, nu = Date.now();
        pods.forEach(function (p) {
            var n = p.metadata.name;
            perNaam[n] = p;
            if (geslagen[n] || podStatus(p) === "terminating") { if (!stervend[n]) stervend[n] = nu; }
        });
        Object.keys(stervend).forEach(function (n) { if (!perNaam[n]) delete stervend[n]; });
        slots = slots.map(function (n) { return n && perNaam[n] ? n : null; });
        pods.slice().sort(function (a, b) {
            return a.metadata.creationTimestamp < b.metadata.creationTimestamp ? -1 : 1;
        }).forEach(function (p) {
            var n = p.metadata.name;
            if (slots.indexOf(n) >= 0 || stervend[n]) return;
            var vrij = slots.indexOf(null);
            if (vrij < 0) {
                vrij = slots.findIndex(function (s) { return s && stervend[s] && nu - stervend[s] >= 500; });
                // Nog een MEP!-animatie bezig: wacht op dat gat in plaats van een extra gat te maken.
                if (vrij < 0 && slots.some(function (s) { return s && stervend[s]; })) return;
            }
            if (vrij >= 0) slots[vrij] = n; else slots.push(n);
        });
        // Overtollige gaten achteraan opvullen of weghalen.
        while (slots.length > AANTAL) {
            var laatste = slots[slots.length - 1], gat = slots.indexOf(null);
            if (laatste === null) { slots.pop(); continue; }
            if (gat < 0) break;
            slots[gat] = slots.pop();
        }

        var veld = $("veld");
        // Altijd minstens 12 gaten tonen, ook voordat de pods er zijn.
        var weergave = slots.slice();
        while (weergave.length < AANTAL) weergave.push(null);
        weergave.forEach(function (n, i) {
            var pod = n && perNaam[n];
            var st = pod ? (geslagen[n] ? "terminating" : podStatus(pod)) : "leeg";
            var sleutel = (n || "") + "|" + st;
            if (!slotEls[i] || slotEls[i].sleutel !== sleutel) {
                var nieuw;
                if (pod) {
                    var kopie = geslagen[n] ? Object.assign({}, pod, { metadata: Object.assign({}, pod.metadata, { deletionTimestamp: "nu" }) }) : pod;
                    nieuw = podKnop(kopie, "pod/" + n.split("-").pop(), false, mep);
                    nieuw.classList.add("groot");
                } else {
                    nieuw = el("div", "pod groot leeg");
                    nieuw.appendChild(el("div", "gat"));
                }
                nieuw.sleutel = sleutel;
                if (slotEls[i]) veld.replaceChild(nieuw, slotEls[i]); else veld.appendChild(nieuw);
                slotEls[i] = nieuw;
            }
            slotEls[i].classList.toggle("antwoordt", !!n && n === antwoorder && st === "running");
        });
        while (slotEls.length > weergave.length) veld.removeChild(slotEls.pop());
    }

    function haalPods() {
        if (podBezig) return;
        podBezig = true;
        K8S.pods().then(function (pods) {
            if (staat !== "starting" && staat !== "running") return;
            // Een nét verwijderde deployment kan een create nog blokkeren: blijf proberen tot er pods zijn.
            if (staat === "starting" && pods.length === 0 && Date.now() - laatsteCreate > 2500) maakDeployment();
            pods.forEach(function (p) {
                if (!gezien[p.metadata.name]) { gezien[p.metadata.name] = true; aantalGezien++; }
            });
            Object.keys(geslagen).forEach(function (n) {
                if (!pods.some(function (p) { return p.metadata.name === n; })) delete geslagen[n];
            });
            laatstePods = pods;
            watcher.update(pods);
            tekenPods(pods);
            toonStats(pods);
        }).catch(function () {}).then(function () { podBezig = false; });
    }

    function checkService() {
        if (serviceBezig) return;
        serviceBezig = true;
        serviceCheck(400).then(function (j) {
            fails = 0;
            antwoorder = j.name || "";
            if (staat === "starting") begin();
            if (serviceDown && staat === "running") log.add("Normal", "Service is reachable again — Kubernetes restored it");
            serviceDown = false;
        }, function () {
            fails++;
            antwoorder = "";
            if (staat === "running" && fails >= 2 && !serviceDown) {
                serviceDown = true;
                plat++;
                snd.boem();
                log.add("Warning", "Service unreachable: no pod is answering!");
                $("plat").hidden = false;
                setTimeout(function () { $("plat").hidden = true; }, 3000);
                toonStats(laatstePods);
            }
        }).then(function () { serviceBezig = false; });
    }

    function begin() {
        staat = "running";
        eindTijd = Date.now() + DUUR * 1000;
        snd.start();
        log.add("Normal", "Service is up — game started, good luck!");
        klokTimer = setInterval(tik, 200);
    }

    function tik() {
        var over = Math.max(0, Math.ceil((eindTijd - Date.now()) / 1000));
        zetTijd(over);
        if (over <= 4 && !afgeteld) { afgeteld = true; snd.aftellen(); }
        if (over === 0) einde();
    }

    function mep(pod, knop) {
        if (staat !== "running") return;
        var n = pod.metadata.name;
        if (geslagen[n]) return;
        geslagen[n] = true;
        snd.mep();
        tekenPods(laatstePods);
        toonStats(laatstePods);
        log.add("Killing", "pod/" + n);
        K8S.deletePod(pod).then(function () {
            gemept++;
            toonStats(laatstePods);
        }, function () { delete geslagen[n]; });
    }

    function ster() {
        $("ster").hidden = true;
        snd.boem();
        log.add("Warning", "Star! Whacking all pods at once");
        laatstePods.filter(function (p) { return podStatus(p) === "running"; }).forEach(function (p) { mep(p); });
    }

    function start() {
        stopTimers();
        resetUI();
        $("einde").hidden = true;
        $("welkom").hidden = true;
        staat = "starting";
        $("start").textContent = "Restart";
        log.clear();
        log.add("Normal", "kubectl apply: deployment api-deployment with " + AANTAL + " replicas");
        maakDeployment();
        podTimer = setInterval(haalPods, 400);
        serviceTimer = setInterval(checkService, 300);
    }

    function maakDeployment() {
        laatsteCreate = Date.now();
        K8S.create().then(function () {
            if (staat === "starting") log.add("Normal", "Scaled up replica set api-deployment to " + AANTAL);
        }, function () {
            log.add("Warning", "Creating the deployment failed — is the admin service reachable?");
        });
    }

    function einde() {
        stopTimers();
        staat = "done";
        K8S.remove().catch(function () {});
        log.add("Normal", "Time's up — deployment api-deployment deleted");
        $("ster").hidden = true;
        tekenPods([]);
        $("running").textContent = "0/" + AANTAL;
        $("tot-pods").textContent = gemept;
        $("tot-plat").textContent = plat;
        $("tot-punten").textContent = punten();
        $("einde-titel").textContent = plat > 0 ? "Cluster broken!" : "Time's up!";
        $("einde-tekst").textContent = plat > 0
            ? "You took the service down " + plat + (plat === 1 ? " time" : " times") + ". Well done!"
            : "Kubernetes held its ground: every pod you whacked came right back.";
        $("einde").hidden = false;
        $("opnieuw").focus();
        $("start").textContent = "Start game";
    }

    function reset() {
        stopTimers();
        staat = "idle";
        $("einde").hidden = true;
        $("welkom").hidden = false;
        $("start").textContent = "Start game";
        resetUI();
        log.clear();
        log.add("Normal", "Reset — deployment api-deployment deleted");
        K8S.remove().catch(function () {});
    }

    $("start").addEventListener("click", start);
    $("reset").addEventListener("click", reset);
    $("opnieuw").addEventListener("click", start);
    $("ster").addEventListener("click", ster);

    resetUI();
    log.add("Ready", "Cluster ready — press Start game");
    K8S.remove().catch(function () {});
})();
