describe("LPF Play", () => {
  it("lists the matches of the section and plays one", () => {
    cy.viewport(1280, 900);
    cy.visit("/lpf");

    // The matches arrive with opaque ids, crests and no provider URL.
    cy.get("button[data-match]", { timeout: 60000 }).should("have.length.greaterThan", 2);
    cy.get("body").then(($body) => {
      expect($body.text()).to.not.contain("sportvideodata");
      expect($body.text()).to.not.contain("sportplus");
      expect($body.find("button[data-match] img").length, "crests").to.be.greaterThan(0);
    });

    // The first match of the section resolves its player and the player mounts.
    cy.get("button[data-match]").first().click();
    cy.get("video", { timeout: 60000 }).should("exist");

    // The match publishes its sources and the page offers them by name.
    cy.get("body", { timeout: 60000 }).should(($body) => {
      const labels = $body
        .find("button")
        .toArray()
        .map((button) => button.textContent?.trim() ?? "")
        .filter((text) => /^Fuente \d+/.test(text));
      expect(labels.length, "sources of the match").to.be.greaterThan(0);
    });

    // The provider answers with a sealed relay reference.
    cy.request("/api/lpf/matches").then((res) => {
      const first = res.body.matches[0];
      expect(first.id).to.match(/^lpm_[a-f0-9]{16}$/);
      cy.request(`/api/lpf/matches/${first.id}`).then((stream) => {
        expect(stream.status).to.equal(200);
        expect(stream.body.src).to.match(/^\/api\/lpf\//);
        expect(stream.body.src).to.not.contain("sportvideodata");
        expect(stream.body.sources.length, "sources").to.be.greaterThan(0);
        for (const source of stream.body.sources) {
          expect(source.src).to.match(/^\/api\/lpf\//);
          expect(source.src).to.not.contain("sportvideodata");
        }
      });
    });

    cy.screenshot("lpf-play", { capture: "viewport" });
  });
});
