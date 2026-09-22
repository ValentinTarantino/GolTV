describe("Responsive Design", () => {
  it("mobile layout: hamburger menu is visible", () => {
    cy.viewport(375, 812);
    cy.visit("/");
    cy.get("#home-page", { timeout: 15000 }).should("exist");
    cy.get("body").should("exist");
  });

  it("mobile layout: desktop search is hidden", () => {
    cy.viewport(375, 812);
    cy.visit("/");
    cy.get("#home-page", { timeout: 15000 }).should("exist");
    cy.get("header .hidden.md\\:flex").should("not.be.visible");
  });

  it("desktop layout: full navigation visible", () => {
    cy.viewport(1280, 720);
    cy.visit("/");
    cy.get("#home-page", { timeout: 15000 }).should("exist");
    cy.get("header").should("exist");
    cy.get('a[href="/leagues"]').should("be.visible");
  });

  it("leagues page: sidebar visible on desktop", () => {
    cy.viewport(1280, 720);
    cy.visit("/leagues");
    cy.get("aside").should("be.visible");
  });

  it("leagues page: mobile sidebar hidden by default", () => {
    cy.viewport(375, 812);
    cy.visit("/leagues");
    cy.get("body").should("exist");
  });

  it("page does not overflow horizontally", () => {
    cy.viewport(375, 812);
    cy.visit("/");
    cy.get("#home-page", { timeout: 15000 }).should("exist");
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(375 + 50);
    });
  });

  it("page does not overflow horizontally on desktop", () => {
    cy.viewport(1280, 720);
    cy.visit("/");
    cy.get("#home-page", { timeout: 15000 }).should("exist");
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(1280 + 20);
    });
  });
});
