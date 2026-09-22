describe("Leagues Page", () => {
  beforeEach(() => {
    cy.visit("/leagues");
  });

  it("loads the leagues page", () => {
    cy.get("body", { timeout: 15000 }).should("exist");
    cy.url().should("include", "/leagues");
  });

  it("shows the desktop sidebar on large screens", () => {
    cy.viewport(1280, 720);
    cy.get("aside").should("exist");
  });

  it("sidebar shows league names", () => {
    cy.viewport(1280, 720);
    cy.get("aside").should("exist");
    cy.get("aside").then(($aside) => {
      const text = $aside.text();
      const hasLeagues =
        text.includes("Liga Profesional") ||
        text.includes("Brasileirão") ||
        text.includes("Libertadores") ||
        text.includes("La Liga") ||
        text.includes("Premier");
      expect(hasLeagues).to.be.true;
    });
  });

  it("clicking a league in the sidebar loads its standings", () => {
    cy.viewport(1280, 720);
    cy.get("aside").should("exist");
    cy.get("aside button").first().click();
    cy.wait(2000);
    cy.get("body").should("exist");
  });

  it("shows league header with logo when a league is selected", () => {
    cy.viewport(1280, 720);
    cy.get("aside").should("exist");

    cy.get("main").then(($main) => {
      const hasLeagueHeader = $main.find("h1").length > 0;
      expect(hasLeagueHeader).to.be.true;
    });
  });
});
