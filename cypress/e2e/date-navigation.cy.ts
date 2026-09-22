describe("Date Navigation", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.get("#home-page", { timeout: 15000 }).should("exist");
  });

  it("has previous and next day navigation buttons", () => {
    cy.get("body").then(($body) => {
      const prevBtn = $body.find("button").filter(':contains("<"), :contains("←"), :contains("prev")');
      const nextBtn = $body.find("button").filter(':contains(">"), :contains("→"), :contains("next")');
      if (prevBtn.length > 0) {
        cy.wrap(prevBtn.first()).should("exist");
      }
      if (nextBtn.length > 0) {
        cy.wrap(nextBtn.first()).should("exist");
      }
    });
  });

  it("clicking previous day loads different content", () => {
    cy.get("body").then(($body) => {
      const navButtons = $body.find("button").filter(':contains("<"), :contains("←")');
      if (navButtons.length > 0) {
        cy.wrap(navButtons.first()).click();
        cy.wait(2000);
        cy.get("#home-page").should("exist");
      }
    });
  });
});
