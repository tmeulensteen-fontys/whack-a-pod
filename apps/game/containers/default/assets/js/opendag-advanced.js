// Advanced/uitlegmodus (opendag-advanced.html): echte nodes, pods en deployment.
(function () {
    var MAX_REPLICAS = 18, STANDAARD = 12;

    var CONCEPTEN = {
        start: { titel: "The cluster", tekst: "Three nodes are ready. A Deployment describes what you want: 12 copies of our app. Kubernetes makes sure it stays that way.", cmd: "kubectl get nodes" },
        deploy: { titel: "Deployment rolled out", tekst: "The Deployment creates a ReplicaSet. It sees 0 of the desired pods and creates them. The scheduler picks a node for each pod.", cmd: "kubectl apply -f api-deployment.yaml" },
        whack: { titel: "Pod whacked = self-healing", tekst: "A pod disappears. The ReplicaSet counts too few pods and immediately creates a replacement. Desired state always wins over actual state.", cmd: "kubectl delete pod <name>" },
        scale: { titel: "Scaling", tekst: "You only change the desired number. Kubernetes adds or removes pods until it matches.", cmd: "kubectl scale deployment api-deployment --replicas=N" },
        cordon: { titel: "Node cordoned", tekst: "The node is SchedulingDisabled. Pods already running there keep running, but the scheduler won't place new pods on it. Try whacking one!", cmd: "kubectl cordon <node>" },
        uncordon: { titel: "Node available again", tekst: "The node is schedulable again. Pods waiting in the queue now get a spot. Existing pods are not rebalanced automatically.", cmd: "kubectl uncordon <node>" },
        drain: { titel: "Node drained", tekst: "Drain = cordon + evict all pods. The ReplicaSet creates replacements, and they land on the other nodes. That's how you do maintenance without downtime.", cmd: "kubectl drain <node> --ignore-daemonsets" },
        remove: { titel: "Deployment deleted", tekst: "Without a Deployment, nobody guards the desired state anymore. All pods are cleaned up and don't come back.", cmd: "kubectl delete deployment api-deployment" },
        reset: { titel: "Cluster reset", tekst: "The deployment is gone and all nodes are schedulable again. Ready for another round.", cmd: "kubectl delete deployment api-deployment && kubectl uncordon --all" }
    };

    var $ = function (id) { return document.getElementById(id); };
    var log = new EventLog($("events"), 16);
    var watcher = new PodWatcher(log);
    var mepGeluid = geluid("assets/audio/pop.wav");

    var pods = [], nodes = [], uitgerold = false, desired = STANDAARD, depBekend = false;
    var geslagen = {}, nodeStaat = {}, antwoorder = "", serviceUp = null, fails = 0;
    var bezig = false, serviceBezig = false, desiredLokaalTot = 0;
    var heeftDepGet = true;      // oudere admin-image kent /deployment/get nog niet

    function concept(sleutel) {
        var c = CONCEPTEN[sleutel];
        $("c-titel").textContent = c.titel;
        $("c-tekst").textContent = c.tekst;
        $("c-cmd").textContent = c.cmd;
    }

    // Hergebruikt bestaande kind-elementen met dezelfde sleutel, zodat animaties niet steeds herstarten.
    function sync(container, items) {
        var oud = {};
        Array.prototype.forEach.call(container.children, function (c) { oud[c.sleutel] = c; });
        items.forEach(function (it, i) {
            var e = oud[it.sleutel];
            if (!e) { e = it.maak(); e.sleutel = it.sleutel; }
            delete oud[it.sleutel];
            if (container.children[i] !== e) container.insertBefore(e, container.children[i] || null);
            if (it.werk) it.werk(e);
        });
        Object.keys(oud).forEach(function (k) { container.removeChild(oud[k]); });
    }

    function status(p) { return geslagen[p.metadata.name] ? "terminating" : podStatus(p); }

    function podItem(p) {
        var n = p.metadata.name, st = status(p);
        return {
            sleutel: n + "|" + st,
            maak: function () {
                var kopie = st === "terminating" && !p.metadata.deletionTimestamp
                    ? Object.assign({}, p, { metadata: Object.assign({}, p.metadata, { deletionTimestamp: "nu" }) }) : p;
                return podKnop(kopie, "…" + n.slice(-5), true, mep);
            },
            werk: function (e) { e.classList.toggle("antwoordt", n === antwoorder && st === "running"); }
        };
    }

    function nodeKaart(node) {
        var kaart = el("div", "node");
        var kop = el("div", "node-kop");
        kop.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#663366" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="1.5"></rect><rect x="3" y="13" width="18" height="7" rx="1.5"></rect><path d="M7 7.5h.01M7 16.5h.01"></path></svg>';
        kop.appendChild(el("span", "naam", node));
        kop.appendChild(el("span", "badge"));
        kop.appendChild(el("span", "last"));
        kop.appendChild(el("span", "vul"));
        var toggle = el("button", "knop-toggle");
        toggle.type = "button";
        toggle.addEventListener("click", function () { wisselCordon(node); });
        kop.appendChild(toggle);
        var drain = el("button", "knop knop-gevaar knop-klein", "Drain");
        drain.type = "button";
        drain.addEventListener("click", function () { doeDrain(node); });
        kop.appendChild(drain);
        kaart.appendChild(kop);
        kaart.appendChild(el("div", "slots"));
        return kaart;
    }

    function teken() {
        var schedulable = 0;
        var items = nodes.map(function (node) {
            var naam = node.metadata.name, cordoned = !!node.spec.unschedulable;
            if (!cordoned) schedulable++;
            var mijn = pods.filter(function (p) { return p.spec.nodeName === naam; });
            var actief = mijn.filter(function (p) { return status(p) !== "terminating"; }).length;
            return {
                sleutel: naam,
                maak: function () { return nodeKaart(naam); },
                werk: function (kaart) {
                    kaart.classList.toggle("cordoned", cordoned);
                    kaart.querySelector(".badge").textContent = cordoned ? "Ready, SchedulingDisabled" : "Ready";
                    kaart.querySelector(".last").textContent = actief + (actief === 1 ? " pod" : " pods");
                    kaart.querySelector(".knop-toggle").textContent = cordoned ? "Uncordon" : "Cordon";
                    kaart.querySelector(".knop-gevaar").disabled = actief === 0;
                    sync(kaart.querySelector(".slots"), mijn.map(podItem));
                }
            };
        });
        sync($("nodes"), items);

        var wachtend = pods.filter(function (p) { return !p.spec.nodeName && status(p) !== "terminating"; });
        sync($("wachtrij"), wachtend.map(function (p) {
            return { sleutel: p.metadata.name, maak: function () { return el("span", "", "…" + p.metadata.name.slice(-5) + " · Pending"); } };
        }));
        $("wachtrij-leeg").hidden = wachtend.length > 0;

        $("n-running").textContent = pods.filter(function (p) { return status(p) === "running"; }).length;
        $("n-pending").textContent = wachtend.length;
        $("n-nodes").textContent = nodes.length ? schedulable + "/" + nodes.length : "–";
        $("n-service").textContent = serviceUp === null ? "–" : (serviceUp ? "UP" : "DOWN");
        $("n-service").style.color = serviceUp === false ? "#C2410C" : "";

        var chip = $("dep-status");
        chip.textContent = uitgerold ? "Active" : "Not deployed";
        chip.className = "status-chip" + (uitgerold ? " ok" : "");
        $("desired").textContent = desired;
        $("deploy").disabled = uitgerold;
        $("undeploy").disabled = !uitgerold;
        $("min").disabled = !uitgerold || desired <= 1;
        $("plus").disabled = !uitgerold || desired >= MAX_REPLICAS;
    }

    function verwerkNodes(lijst) {
        lijst.sort(function (a, b) { return a.metadata.name < b.metadata.name ? -1 : 1; });
        lijst.forEach(function (n) {
            var naam = n.metadata.name, c = !!n.spec.unschedulable;
            if (naam in nodeStaat && nodeStaat[naam] !== c) {
                log.add(c ? "Cordon" : "Uncordon", "node/" + naam + (c ? " SchedulingDisabled" : " schedulable"));
            }
            nodeStaat[naam] = c;
        });
        nodes = lijst;
    }

    function verwerkDeployment(dep) {
        if (dep && dep.spec) {
            uitgerold = !dep.metadata.deletionTimestamp;
            if (Date.now() > desiredLokaalTot) desired = dep.spec.replicas;
            depBekend = true;
        } else if (dep && dep.error) {
            uitgerold = false;
            depBekend = true;
        }
    }

    function ververs() {
        if (bezig) return;
        bezig = true;
        Promise.all([
            K8S.nodes(),
            K8S.pods(),
            heeftDepGet ? K8S.deployment().catch(function (e) {
                if (/404/.test(e.message)) heeftDepGet = false;
                return null;
            }) : null
        ]).then(function (r) {
            verwerkNodes(r[0]);
            pods = r[1];
            Object.keys(geslagen).forEach(function (n) {
                if (!pods.some(function (p) { return p.metadata.name === n; })) delete geslagen[n];
            });
            verwerkDeployment(r[2]);
            if (!depBekend) uitgerold = pods.length > 0;
            watcher.update(pods);
            teken();
        }).catch(function () {}).then(function () { bezig = false; });
    }

    function checkService() {
        if (serviceBezig || !uitgerold) {
            if (!uitgerold) { serviceUp = null; antwoorder = ""; }
            return;
        }
        serviceBezig = true;
        serviceCheck(800).then(function (j) {
            if (serviceUp === false) log.add("Normal", "Service is reachable again");
            serviceUp = true; fails = 0; antwoorder = j.name || "";
        }, function () {
            fails++;
            antwoorder = "";
            if (fails >= 2 && serviceUp !== false) {
                if (serviceUp === true) log.add("Warning", "Service unreachable: no pod is answering");
                serviceUp = false;
            }
        }).then(function () { serviceBezig = false; });
    }

    function mep(pod) {
        var n = pod.metadata.name;
        if (geslagen[n]) return;
        geslagen[n] = true;
        mepGeluid();
        concept("whack");
        log.add("Killing", "pod/" + n + " (whacked)");
        teken();
        K8S.deletePod(pod).catch(function () { delete geslagen[n]; });
    }

    function wisselCordon(naam) {
        var c = nodeStaat[naam];
        concept(c ? "uncordon" : "cordon");
        (c ? K8S.uncordon(naam) : K8S.cordon(naam)).then(ververs, function () {
            log.add("Warning", (c ? "Uncordon" : "Cordon") + " of node/" + naam + " failed — is the latest admin image running?");
        });
    }

    function doeDrain(naam) {
        concept("drain");
        log.add("Cordon", "node/" + naam + " cordoned, evicting pods");
        K8S.drain(naam).then(ververs, function () { log.add("Warning", "Drain of node/" + naam + " failed"); });
    }

    function schaal(delta) {
        var n = Math.max(1, Math.min(MAX_REPLICAS, desired + delta));
        if (n === desired) return;
        desired = n;
        desiredLokaalTot = Date.now() + 1500;
        concept("scale");
        log.add("Normal", "Scaled replica set api-deployment to " + n);
        teken();
        K8S.scale(n).catch(function () { log.add("Warning", "Scaling failed — is the latest admin image running?"); });
    }

    function deploy() {
        concept("deploy");
        log.add("Normal", "Scaled up replica set api-deployment to " + STANDAARD);
        desired = STANDAARD;
        K8S.create().then(ververs, function () { log.add("Warning", "Creating the deployment failed"); });
    }

    function undeploy() {
        concept("remove");
        log.add("Normal", "deployment.apps/api-deployment deleted");
        K8S.remove().then(ververs);
    }

    function reset() {
        concept("reset");
        log.add("Normal", "Reset: deployment deleted, all nodes uncordoned");
        Promise.all([K8S.remove()].concat(nodes.map(function (n) { return K8S.uncordon(n.metadata.name); })))
            .catch(function () {}).then(ververs);
    }

    $("deploy").addEventListener("click", deploy);
    $("undeploy").addEventListener("click", undeploy);
    $("reset").addEventListener("click", reset);
    $("min").addEventListener("click", function () { schaal(-1); });
    $("plus").addEventListener("click", function () { schaal(1); });

    concept("start");
    log.add("Ready", "Connected to the cluster");
    teken();
    ververs();
    setInterval(ververs, 700);
    setInterval(checkService, 600);
})();
