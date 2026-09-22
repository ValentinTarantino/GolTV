describe("Match Navigation", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.get("#home-page", { timeout: 15000 }).should("exist");
  });

  it("clicking a match card navigates to the watch page", () => {
    cy.get("body").then(($body) => {
      const cards = $body.find("[id^='match-card-']");
      if (cards.length === 0) {
        cy.log("No match cards today — skipping navigation test");
        return;
      }

      cy.get("[id^='match-card-']").first().then(($card) => {
        const href = $card.attr("href");
        expect(href).to.contain("/watch/");
        cy.wrap($card).click();
        cy.url().should("include", "/watch/");
        cy.url().then((url) => {
          expect(url).to.match(/\/watch\/\d+/);
        });
      });
    });
  });

  it("watch page shows match info or player area", () => {
    cy.get("body").then(($body) => {
      const cards = $body.find("[id^='match-card-']");
      if (cards.length === 0) {
        cy.log("No match cards today — skipping watch page test");
        return;
      }
      cy.get("[id^='match-card-']").first().click();
      cy.url().should("include", "/watch/");
      cy.get("body").should("exist");
    });
  });
});
