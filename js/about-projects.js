const target = document.querySelector('.about-hero-grid > div');

if (target) {
  target.innerHTML = `
    <div class="eyebrow">სხვა პროექტები</div>
    <h1>აღმოაჩინე ჩვენი სხვა პროექტები</h1>
    <p class="lead">ისტორია, სპორტი, შინაური ცხოველები და საქართველო ერთ სივრცეში.</p>
    <div class="about-project-links">
      <a href="https://www.giftgrb.ge/" target="_blank" rel="noopener">
        <b>GIFTGRB</b>
        <span>მოიკვლიე შენი გვარის ისტორია</span>
        <small>გადასვლა საიტზე</small>
      </a>
      <a href="https://apps.apple.com/us/app/dm-football-georgia/id6767113626" target="_blank" rel="noopener">
        <b>DM Football Georgia</b>
        <span>ქართული ფეხბურთის აპლიკაცია</span>
        <small>App Store</small>
      </a>
      <a href="https://apps.apple.com/us/app/georgian-pets/id6761689936" target="_blank" rel="noopener">
        <b>Georgian Pets</b>
        <span>შინაური ცხოველების ქართული აპლიკაცია</span>
        <small>App Store</small>
      </a>
      <a href="https://apps.apple.com/us/app/georgia-history/id6760388933" target="_blank" rel="noopener">
        <b>Georgian History</b>
        <span>საქართველოს ისტორიის აპლიკაცია</span>
        <small>App Store</small>
      </a>
    </div>
  `;
}
