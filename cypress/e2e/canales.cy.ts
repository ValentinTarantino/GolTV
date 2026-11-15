describe("Canales", () => {
  it("lists the channels and plays a sports one on the first try", () => {
    cy.viewport(1280, 900);
    cy.visit("/canales");

    // The list arrives with opaque ids only.
    cy.get("button[data-canal]", { timeout: 60000 }).should("have.length.greaterThan", 5);
    cy.get("body").then(($body) => {
      expect($body.text()).to.not.contain("trapemn.tv");
      expect($body.text()).to.not.contain("akamaized.net");
    });

    cy.contains("button", "Fox Sports").click();

    // The picture shows up without needing a reload.
    cy.get("video", { timeout: 45000 }).should(($video) => {
      const element = $video[0] as HTMLVideoElement;
      expect(element.readyState, "readyState").to.be.greaterThan(1);
      expect(element.videoWidth, "video width").to.be.greaterThan(0);
    });

    // The sound is muted only until the first picture is on screen.
    cy.get("video", { timeout: 30000 }).should(($video) => {
      const element = $video[0] as HTMLVideoElement;
      expect(element.muted, "muted").to.equal(false);
    });
  });
});
