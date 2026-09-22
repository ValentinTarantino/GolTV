describe("Language Toggle", () => {
  it("ES and EN buttons are visible", () => {
    cy.visit("/", { timeout: 30000 });
    cy.get("#home-page", { timeout: 30000 }).should("exist");
    cy.get("button").contains("ES").should("be.visible");
    cy.get("button").contains("EN").should("be.visible");
  });

  it("clicking EN changes the UI to English", () => {
    cy.visit("/", { timeout: 30000 });
    cy.get("#home-page", { timeout: 30000 }).should("exist");
    cy.get("button").contains("EN").click();
    cy.wait(1000);

    cy.get("body").then(($body) => {
      const text = $body.text().toLowerCase();
      const isEnglish = text.includes("today") || text.includes("matches") || text.includes("live");
      expect(isEnglish).to.be.true;
    });
  });

  it("clicking ES changes the UI back to Spanish", () => {
    cy.visit("/", { timeout: 30000 });
    cy.get("#home-page", { timeout: 30000 }).should("exist");
    cy.get("button").contains("EN").click();
    cy.wait(1000);
    cy.get("button").contains("ES").click();
    cy.wait(1000);

    cy.get("body").then(($body) => {
      const text = $body.text().toLowerCase();
      const isSpanish = text.includes("hoy") || text.includes("partidos") || text.includes("en vivo");
      expect(isSpanish).to.be.true;
    });
  });

  it("language persists after page reload", () => {
    cy.visit("/", { timeout: 30000 });
    cy.get("#home-page", { timeout: 30000 }).should("exist");
    cy.get("button").contains("EN").click();
    cy.wait(1000);
    cy.visit(`/?_t=${Date.now()}`, { timeout: 60000 });
    cy.get("#home-page", { timeout: 30000 }).should("exist");
    cy.wait(2000);

    cy.get("button").contains("EN").should("exist");
    cy.get("button").contains("ES").should("exist");

    cy.get("body").then(($body) => {
      const text = $body.text().toLowerCase();
      const isEnglish = text.includes("today") || text.includes("matches") || text.includes("live");
      expect(isEnglish).to.be.true;
    });
  });
});
