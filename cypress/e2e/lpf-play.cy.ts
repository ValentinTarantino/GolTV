describe("LPF Play", () => {
  it("lists the matches of the section and opens one", () => {
    cy.viewport(1280, 900);
    cy.visit("/lpf");

    // The matches arrive with opaque ids, crests and no provider URL.
    cy.get("button[data-match]", { timeout: 60000 }).should("have.length.greaterThan", 2);
    cy.get("body").then(($body) => {
      expect($body.text()).to.not.contain("sportvideodata");
      expect($body.text()).to.not.contain("sportplus");
      expect($body.find("button[data-match] img").length, "crests").to.be.greaterThan(0);
    });

    // Opening a match mounts its player, or says that the sources come with
    // the broadcast — never the generic "signal unavailable" for an upcoming one.
    cy.get("button[data-match]").first().click();
    cy.get("body", { timeout: 60000 }).should(($body) => {
      const text = $body.text();
      const playing = $body.find("video").length > 0;
      const scheduled = text.includes("Fuentes disponibles al inicio") ||
        text.includes("aparecen cuando arranca");
      expect(playing || scheduled, "player or kickoff notice").to.equal(true);
    });

    // Every match id is opaque and the resolver answers with sealed players.
    cy.request("/api/lpf/matches").then((res) => {
      for (const match of res.body.matches) {
        expect(match.id).to.match(/^lpm_[a-f0-9]{16}$/);
      }
      const first = res.body.matches[0];
      cy.request({ url: `/api/lpf/matches/${first.id}`, failOnStatusCode: false }).then((stream) => {
        expect(stream.status).to.be.oneOf([200, 404]);
        if (!stream.body.src) {
          expect(stream.body.sources).to.deep.equal([]);
          return;
        }
        expect(stream.body.src).to.match(/^\/api\/lpf\//);
        expect(stream.body.src).to.not.contain("sportvideodata");
        expect(stream.body.sources.length, "sources").to.be.greaterThan(0);
        const sealed = new Set();
        for (const source of stream.body.sources) {
          expect(source.src).to.match(/^\/api\/lpf\//);
          expect(source.src).to.not.contain("sportvideodata");
          sealed.add(source.src);
        }
        expect(sealed.size, "no repeated sources").to.equal(stream.body.sources.length);
      });
    });

    cy.screenshot("lpf-play", { capture: "viewport" });
  });
});
