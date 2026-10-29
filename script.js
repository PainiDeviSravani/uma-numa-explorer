
/* =====================================================
   MEMORY LAB — UMA vs NUMA
   Architecture switching and navigation
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

    // =====================================================
    // 1. UMA vs NUMA ARCHITECTURE SWITCHING
    // =====================================================

    const umaButton = document.getElementById("uma-mode");
    const numaButton = document.getElementById("numa-mode");
    const description = document.getElementById("architecture-description");

    function setArchitecture(mode) {
        const isUMA = mode === "UMA";

        // Update active button styles
        if (umaButton) {
            umaButton.classList.toggle("active", isUMA);
            umaButton.setAttribute("aria-pressed", String(isUMA));
        }

        if (numaButton) {
            numaButton.classList.toggle("active", !isUMA);
            numaButton.setAttribute("aria-pressed", String(!isUMA));
        }

        // Update the architecture description
        if (description) {
            description.textContent = isUMA
                ? "UMA view: Multiple processors access a shared main-memory system with approximately uniform memory-access latency. Shared resources can still experience contention."
                : "NUMA view: Processors are organized into nodes with local memory. Local accesses are generally faster, while remote memory requests travel across the interconnect.";
        }

        // Update the 3D visualization ONCE
        window.dispatchEvent(
            new CustomEvent("architectureChange", {
                detail: { architecture: mode }
            })
        );
    }

    // Add button click events
    if (umaButton) {
        umaButton.addEventListener("click", () => {
            setArchitecture("UMA");
        });
    }

    if (numaButton) {
        numaButton.addEventListener("click", () => {
            setArchitecture("NUMA");
        });
    }

    // Start with UMA selected
    setArchitecture("UMA");


    // =====================================================
    // 2. PAGE NAVIGATION
    // =====================================================

    function initializeNavigation() {
        const navLinks = document.querySelectorAll(
            '.nav-links a[href^="#"]'
        );

        navLinks.forEach(link => {
            link.addEventListener("click", event => {
                const targetId = link.getAttribute("href");
                const target = document.querySelector(targetId);

                // Ignore links whose target does not exist
                if (!target) {
                    return;
                }

                event.preventDefault();

                // Smoothly scroll to the selected section
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                // Update URL without reloading the page
                if (history.replaceState) {
                    history.replaceState(null, "", targetId);
                }
            });
        });
    }

    initializeNavigation();

});
