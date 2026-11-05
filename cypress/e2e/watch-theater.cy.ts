describe("fullscreen with chat layout", () => {
  beforeEach(() => {
    cy.intercept("GET", "**/api/matches/12345*", { match: {
      id: 12345,
      homeTeam: { id: 1, name: "Boca Juniors", logo: "" },
      awayTeam: { id: 2, name: "River Plate", logo: "" },
      league: { id: 128, name: "Liga Profesional", country: "Argentina", flag: "", slug: "liga-argentina", logo: "" },
      date: new Date().toISOString(), timestamp: Math.floor(Date.now() / 1000),
      status: { short: "LIVE", long: "En Juego", elapsed: null },
      score: { home: null, away: null },
      channels: [{ id: "test-channel", name: "Señal de prueba", kind: "iframe", url: "/theater-test-video" }],
    } }).as("match");
    cy.intercept("GET", "**/api/chat?*", {
      persistent: true,
      messages: [{ id: "one", nick: "Hincha", text: "¡Vamos equipo!", ts: 1 }],
    });
    cy.intercept("POST", "**/api/viewers", { count: 1 });
    cy.intercept("GET", "**/theater-test-video", {
      headers: { "content-type": "text/html" },
      body: '<html><body style="margin:0;background:#102518;color:white;height:100vh;display:grid;place-items:center;font:24px sans-serif">Video de prueba</body></html>',
    });
  });

  const openMatch = () => {
    cy.visit("/watch/12345?player=1", {
      onBeforeLoad(win) {
        win.localStorage.setItem("goltv-chat-nick", "Prueba");
        // Exercise the viewport fallback; native API transitions have unit coverage.
        cy.stub(win.HTMLElement.prototype, "requestFullscreen").rejects(new Error("Test fallback"));
      },
    });
    cy.wait("@match");
    cy.get('iframe[title="Boca Juniors vs River Plate"]').should("be.visible");
    cy.window().then(win => {
      cy.contains("button", "Pantalla completa con chat").then($button => {
        cy.get(win.innerWidth < 1024 ? ".watch-theater-chat" : "#watch-league-header").then($anchor => {
          expect($button[0].getBoundingClientRect().top).to.be.greaterThan($anchor[0].getBoundingClientRect().bottom);
          expect($anchor[0].contains($button[0])).to.equal(false);
        });
      });
      if (win.innerWidth < 1024) {
        cy.get(".watch-theater-chat").then($chat => {
          cy.get(".watch-theater-content").then($content => {
            expect($chat[0].getBoundingClientRect().top).to.be.greaterThan($content[0].getBoundingClientRect().bottom);
          });
        });
      }
    });
    cy.get('input[placeholder="Escribí un mensaje..."]').type("Mi mensaje sin enviar");
    cy.contains("button", "Pantalla completa con chat").click();
    cy.get('.watch-theater[data-expanded="true"]').should("be.visible");
    cy.get("#watch-league-header").should("not.be.visible");
    cy.get("#player-mode-selector").should("not.be.visible");
  };

  it("fits video and chat on desktop and preserves both while toggling", () => {
    cy.viewport(1280, 720);
    openMatch();
    cy.get(".watch-theater-playback > .aspect-video").then($player => {
      const rect = $player[0].getBoundingClientRect();
      expect(rect.width).to.be.greaterThan(500);
      expect(rect.height).to.be.greaterThan(250);
      expect(rect.right).to.be.lessThan(1281);
      expect(rect.bottom).to.be.lessThan(721);
      expect(Math.abs(rect.width / rect.height - 16 / 9)).to.be.lessThan(0.02);
    });
    cy.get(".watch-theater-chat").then($chat => {
      const rect = $chat[0].getBoundingClientRect();
      expect(rect.right).to.be.lessThan(1281);
      expect(rect.bottom).to.be.lessThan(721);
      expect(rect.height).to.be.greaterThan(500);
    });
    cy.get('iframe[title="Boca Juniors vs River Plate"]').then($frame => {
      const original = $frame[0];
      cy.screenshot("watch-theater-desktop", { capture: "viewport" });
      cy.contains("button", "Ocultar chat").click();
      cy.get(".watch-theater-chat").should("not.be.visible");
      cy.contains("button", "Mostrar chat").click();
      cy.get('input[placeholder="Escribí un mensaje..."]').should("have.value", "Mi mensaje sin enviar");
      cy.contains("button", "Salir de pantalla completa").click();
      cy.get('iframe[title="Boca Juniors vs River Plate"]').should($current => expect($current[0]).to.equal(original));
    });
    cy.get("body").should("not.have.class", "watch-theater-open");
    cy.get("#player-mode-selector").should("be.visible");
    cy.contains("button", "REPRODUCTOR 2").click();
    cy.wait("@match");
    cy.contains("button", "Pantalla completa con chat").should("not.exist");
    cy.contains("button", "REPRODUCTOR 1").click();
    cy.wait("@match");
    cy.contains("button", "Pantalla completa con chat").should("be.visible");
  });

  it("stacks video and chat in portrait and keeps exit controls within reach", () => {
    cy.viewport(390, 844);
    openMatch();
    cy.contains("button", "Salir de pantalla completa").should("be.visible");
    cy.get(".watch-theater-playback > .aspect-video").then($player => {
      const rect = $player[0].getBoundingClientRect();
      expect(rect.width).to.be.greaterThan(300);
      expect(rect.height).to.be.greaterThan(160);
      expect(rect.right).to.be.lessThan(391);
      expect(Math.abs(rect.width / rect.height - 16 / 9)).to.be.lessThan(0.02);
    });
    cy.get(".watch-theater-chat").then($chat => {
      const rect = $chat[0].getBoundingClientRect();
      expect(rect.width).to.be.greaterThan(300);
      expect(rect.bottom).to.be.lessThan(845);
    });
    cy.screenshot("watch-theater-portrait", { capture: "viewport" });
    cy.contains("button", "Ocultar chat").click();
    cy.contains("button", "Salir de pantalla completa").click();
    cy.get("body").should("not.have.class", "watch-theater-open");
  });

  it("allows anonymous reading and remembers the colors sent with messages", () => {
    cy.viewport(1280, 720);
    const messages = [{ id: "first", matchId: "12345", nick: "Hincha", text: "Podés leer sin registrarte", ts: 1,
      nickColor: "#00ffff", textColor: "#ff8800" }];
    cy.intercept("GET", "**/api/chat?*", req => req.reply({ persistent: true, messages }));
    cy.intercept("POST", "**/api/chat", req => {
      messages.push({ ...req.body, id: `sent-${messages.length}`, ts: messages.length + 1 });
      req.reply({ ok: true, persistent: true });
    }).as("sendChat");
    cy.visit("/watch/12345?player=1", { onBeforeLoad(win) {
      for (const key of ["goltv-chat-nick", "goltv-chat-nick-color", "goltv-chat-text-color"]) win.localStorage.removeItem(key);
    } });
    cy.get('[role="log"]').should("contain.text", "Podés leer sin registrarte");
    cy.get('input[placeholder="Escribí un mensaje..."]').should("not.exist");
    cy.screenshot("chat-anonymous", { capture: "viewport" });

    const setColor = (label: string, value: string) => {
      cy.get(`[role="combobox"][aria-label="${label}"]`).click();
      cy.get(`[role="option"][data-value="${value}"]`).click();
    };
    cy.get('input[type="color"]').should("not.exist");
    cy.get('[role="combobox"][aria-label="Color del nombre"]').click();
    cy.get('[role="option"]').should("have.length", 24);
    cy.get('[role="option"][data-value="#a78bfa"]').trigger("mouseover").should("have.css", "color", "rgb(167, 139, 250)");
    cy.screenshot("chat-color-menu", { capture: "viewport" });
    cy.get('[role="option"][data-value="#000000"], [role="option"][data-value="#808080"]').should("not.exist");
    cy.get('[role="combobox"][aria-label="Color del nombre"]').trigger("keydown", { key: "Escape" });
    setColor("Color del nombre", "#ff00ff");
    setColor("Color del mensaje", "#00ff00");
    cy.get('input[aria-label="Tu nick"]').type("FanColor");
    cy.contains("button", "Entrar").click();
    cy.get('input[placeholder="Escribí un mensaje..."]').type("Nuevo mensaje");
    cy.get('button[aria-label="Enviar"]').click();
    cy.wait("@sendChat").its("request.body").should("include", {
      nick: "FanColor", text: "Nuevo mensaje", nickColor: "#ff00ff", textColor: "#00ff00",
    });
    cy.contains('[role="log"] span', "FanColor:").should("have.css", "color", "rgb(255, 0, 255)");
    cy.contains('[role="log"] span', "Nuevo mensaje").should("have.css", "color", "rgb(0, 255, 0)");
    cy.reload();
    cy.get('[role="combobox"][aria-label="Color del nombre"]').should("have.attr", "data-value", "#ff00ff");
    cy.get('[role="combobox"][aria-label="Color del mensaje"]').should("have.attr", "data-value", "#00ff00");
    cy.get('button[aria-label="Cambiar nick"]').should("contain.text", "@FanColor").click();
    cy.get('input[aria-label="Tu nick"]').clear().type("OtroNick");
    cy.contains("button", "Guardar nick").click();
    cy.get('[role="log"]').should("contain.text", "Nuevo mensaje");
    cy.get('input[placeholder="Escribí un mensaje..."]').type("Con mi nuevo nick");
    cy.get('button[aria-label="Enviar"]').click();
    cy.wait("@sendChat").its("request.body").should("include", {
      nick: "OtroNick", text: "Con mi nuevo nick", nickColor: "#ff00ff", textColor: "#00ff00",
    });
    cy.contains('[role="log"] span', "OtroNick:").should("have.css", "font-size", "14px");
    cy.contains('[role="log"] span', "Con mi nuevo nick").should("have.css", "font-size", "14px");
    cy.screenshot("chat-large-text", { capture: "viewport" });
  });
});
