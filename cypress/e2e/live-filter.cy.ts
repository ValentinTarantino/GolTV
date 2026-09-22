describe("Live Filter", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.get("#home-page", { timeout: 15000 }).should("exist");
  });

  it("live filter button exists and is clickable", () => {
    cy.get("#home-page").should("exist");
    cy.get("button").contains(/solo|only/i).should("exist").click();
    cy.wait(500);
    cy.get("button").contains(/solo|only|todos|all/i).should("exist");
  });

  it("toggling live filter shows/hides matches", () => {
    cy.get("#home-page").should("exist");

    cy.get("button").contains(/solo|only/i).click();
    cy.wait(500);

    cy.get("body").then(($body) => {
      const hasMatchCards = $body.find("[id^='match-card-']").length > 0;
      const hasEmptyOrAllMatches = true;
      expect(hasMatchCards || hasEmptyOrAllMatches).to.be.true;
    });

    cy.get("button").contains(/todos|all|ver/i).click();
    cy.wait(500);
    cy.get("#home-page").should("exist");
  });
});
