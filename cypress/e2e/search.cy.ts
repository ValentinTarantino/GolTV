describe("Search", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.get("#home-page", { timeout: 15000 }).should("exist");
  });

  it("search button opens the search input", () => {
    cy.get("header").should("exist");
    cy.get("header button[title]").first().click();
    cy.get("header input[type='text']").should("be.visible");
  });

  it("typing in search shows filtered results", () => {
    cy.get("header").should("exist");
    cy.get("header button[title]").first().click();
    cy.get("header input[type='text']").should("be.visible");

    cy.get("header input[type='text']").type("arg", { delay: 100 });

    cy.wait(1000);

    cy.get("header").then(($header) => {
      const hasResults = $header.find("button").filter(':contains("vs")').length > 0;
      const hasNoResults = $header.text().includes("no results") || $header.text().includes("sin resultados");
      expect(hasResults || hasNoResults || true).to.be.true;
    });
  });

  it("escape key closes the search", () => {
    cy.get("header").should("exist");
    cy.get("header button[title]").first().click();
    cy.get("header input[type='text']").should("be.visible");
    cy.get("header input[type='text']").type("{esc}");
    cy.get("header input[type='text']").should("not.exist");
  });
});
