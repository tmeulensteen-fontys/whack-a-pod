// Gedeelde helpers voor opendag.html en opendag-advanced.html.
// Praat met de admin-API (/admin/k8s/...) en de api-service (/api/...) via dezelfde host.

var ADMIN = "/admin/k8s";

function adminGet(pad, timeout) {
    return httpGet(ADMIN + pad, timeout || 5000).then(function (r) {
        return r.json().catch(function () { return {}; });
    });
}

function httpGet(url, timeout) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, timeout);
    return fetch(url, { cache: "no-store", signal: ctrl.signal }).then(function (r) {
        clearTimeout(t);
        if (!r.ok && r.status !== 202) throw new Error("HTTP " + r.status);
        return r;
    }, function (e) { clearTimeout(t); throw e; });
}

var K8S = {
    pods: function () { return adminGet("/pods/get").then(function (j) { return j.items || []; }); },
    nodes: function () { return adminGet("/nodes/get").then(function (j) { return j.items || []; }); },
    deployment: function () { return adminGet("/deployment/get"); },
    create: function () { return adminGet("/deployment/create", 10000); },
    remove: function () { return adminGet("/deployment/delete", 10000); },
    scale: function (n) { return adminGet("/deployment/scale?replicas=" + n); },
    deletePod: function (pod) {
        return adminGet("/pod/delete?pod=" + encodeURIComponent("/api/v1/namespaces/" + pod.metadata.namespace + "/pods/" + pod.metadata.name));
    },
    cordon: function (node) { return adminGet("/node/cordon?node=" + encodeURIComponent(node)); },
    uncordon: function (node) { return adminGet("/node/uncordon?node=" + encodeURIComponent(node)); },
    drain: function (node) { return adminGet("/node/drain?node=" + encodeURIComponent(node)); }
};

// Vraagt de api-service via Traefik; geeft {color, name} van de pod die antwoordde.
function serviceCheck(timeout) {
    return httpGet("/api/color-complete/", timeout || 400).then(function (r) { return r.json(); });
}

// running | terminating | creating | pending
function podStatus(pod) {
    if (pod.metadata.deletionTimestamp) return "terminating";
    var phase = pod.status && pod.status.phase;
    if (phase === "Succeeded" || phase === "Failed") return "terminating";
    if (!pod.spec.nodeName) return "pending";
    var cs = (pod.status && pod.status.containerStatuses) || [];
    if (phase === "Running" && cs.length && cs.every(function (c) { return c.ready; })) return "running";
    return "creating";
}

var STATUS_LABEL = { running: "Running", terminating: "Terminating", creating: "ContainerCreating", pending: "Pending" };

function nuTijd() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

function el(tag, cls, tekst) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (tekst !== undefined) e.textContent = tekst;
    return e;
}

// Event-log in de stijl van `kubectl get events -w`.
function EventLog(container, max) {
    this.add = function (tag, tekst) {
        var rij = el("div", "event");
        rij.appendChild(el("time", "", nuTijd()));
        rij.appendChild(el("b", "tag-" + tag, tag));
        rij.appendChild(el("span", "", tekst));
        container.insertBefore(rij, container.firstChild);
        while (container.children.length > max) container.removeChild(container.lastChild);
    };
    this.clear = function () { container.innerHTML = ""; };
}

// Houdt bij welke pods er zijn en meldt veranderingen als events.
function PodWatcher(log) {
    var bekend = {};
    this.update = function (pods) {
        var nu = {};
        pods.forEach(function (p) {
            var naam = p.metadata.name, st = podStatus(p), oud = bekend[naam];
            nu[naam] = { status: st, node: p.spec.nodeName };
            if (!oud) {
                log.add("Created", "ReplicaSet created pod/" + naam);
                if (p.spec.nodeName) log.add("Scheduled", "pod/" + naam + " → " + p.spec.nodeName);
            } else {
                if (!oud.node && p.spec.nodeName) log.add("Scheduled", "pod/" + naam + " → " + p.spec.nodeName);
                if (oud.status !== "running" && st === "running") log.add("Started", "pod/" + naam + " is Running on " + p.spec.nodeName);
            }
        });
        bekend = nu;
    };
    this.reset = function () { bekend = {}; };
}

var MOL_IMG = "assets/img/mole.png";   // pixel-art mol mét eigen put, 264 x 288
var SPINNER_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#663366" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9"></path></svg>';

// Bouwt een pod-knop (mol in een gat). naamTekst: wat er als naam onder staat.
function podKnop(pod, naamTekst, klein, onWhack) {
    var st = podStatus(pod);
    var b = el("button", "pod " + st + (klein ? " klein" : ""));
    b.type = "button";
    b.dataset.pod = pod.metadata.name;
    b.dataset.status = st;
    b.setAttribute("aria-label", (st === "running" ? "Whack pod " : "Pod ") + pod.metadata.name + " (" + STATUS_LABEL[st] + ")");
    var gat = el("div", "gat");
    if (st === "running" || st === "terminating") {
        // De mol heeft zijn eigen put, dus het CSS-gat verbergen we zolang hij er staat.
        gat.classList.add("met-mol");
        if (st === "terminating" && !klein) gat.appendChild(el("div", "mep", "WHACK!"));
        var mol = el("div", st === "running" ? "mol" : "mol geraakt");
        var img = el("img");
        img.src = MOL_IMG;
        img.alt = "";
        img.draggable = false;
        mol.appendChild(img);
        gat.appendChild(mol);
    } else {
        var w = el("div", "wacht");
        w.innerHTML = SPINNER_SVG;
        gat.appendChild(w);
    }
    b.appendChild(gat);
    var info = el("div", "pod-info");
    info.appendChild(el("span", "pod-naam", naamTekst));
    info.appendChild(el("span", "chip " + st, STATUS_LABEL[st]));
    b.appendChild(info);
    b.addEventListener("click", function () { if (st === "running") onWhack(pod, b); });
    return b;
}

// Speelt een geluid af als het bestand bestaat; fouten (bv. autoplay-blokkade) negeren.
function geluid(bestand, volume) {
    var a = new Audio(bestand);
    a.volume = volume || .5;
    return function () { try { a.currentTime = 0; a.play().catch(function () {}); } catch (e) {} };
}
