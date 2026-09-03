import { THUMBTACK_PROFILE_URL, THUMBTACK_PROOF } from "../content/site";

const SERVICE_ID = "580274029751476226";
const THUMBTACK_ASSET_ROOT =
  "https://cdn.thumbtackstatic.com/fe-assets-web/media";
const STAR_URL = `${THUMBTACK_ASSET_ROOT}/pages/profile/standard-widgets/review-widget/orange_star.svg`;

type WidgetType = "star" | "one";

function stars() {
  return Array.from({ length: 5 }, () => `<img src="${STAR_URL}" alt="">`).join(
    ""
  );
}

function widgetDocument(type: WidgetType): string {
  const themeStyles =
    type === "star"
      ? `
      #tt-review-widget-star {
        box-sizing: border-box !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #f2f7f2 !important;
      }
      #tt-review-widget-star > img {
        filter: brightness(0) invert(1);
        opacity: 0.9;
      }
      #tt-review-widget-star a { color: #f2f7f2 !important; }
      #tt-review-widget-star #tt-dynamic { color: #9db8ad !important; }
    `
      : `
      #tt-review-widget-one {
        box-sizing: border-box !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #9db8ad !important;
      }
      #tt-review-widget-one > img {
        filter: brightness(0) invert(1);
        opacity: 0.9;
      }
      #tt-review-widget-one #tt-dynamic .tt-right .tt-name,
      #tt-review-widget-one #tt-dynamic .tt-right p {
        color: #f2f7f2 !important;
      }
      #tt-review-widget-one #tt-dynamic .tt-right span {
        color: #9db8ad !important;
      }
      #tt-review-widget-one a {
        color: #83e282 !important;
        font-weight: 700 !important;
      }
    `;

  const widgetMarkup =
    type === "star"
      ? `<div class="widget" id="tt-review-widget-star">
  <img src="${THUMBTACK_ASSET_ROOT}/logos/thumbtack/wordmark.svg" alt="Thumbtack" class="tt-logo">
  <a target="_blank" rel="noopener noreferrer" href="${THUMBTACK_PROFILE_URL}">
    <div>Progressive Transportation Services</div>
  </a>
  <div id="tt-dynamic">${stars()}&nbsp;<span>${THUMBTACK_PROOF.reviews}</span></div>
</div>`
      : `<div class="widget" id="tt-review-widget-one">
  <img src="${THUMBTACK_ASSET_ROOT}/logos/thumbtack/wordmark.svg" alt="Thumbtack">
  <div id="tt-dynamic">
    <div class="tt-left">
      <img src="https://cdn.thumbtackstatic.com/fe-assets-web/_assets/images/release/components/avatar/images/legacy-default-avatar-50x50.25cbe35c0002a2eef6cbc5f1c4f271545eafbb59.png" alt="">
    </div>
    <div class="tt-right">
      <div class="tt-name">Jacky J.</div>
      <div class="tt-stars">${stars()}&nbsp;<span>${THUMBTACK_PROOF.reviews}</span> <span>1d ago</span></div>
      <p>the 2 workers were polite and helpful</p>
      <a target="_blank" rel="noopener noreferrer" href="${THUMBTACK_PROFILE_URL}">See all reviews</a>
    </div>
    <br>
  </div>
</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { margin: 0; min-width: 0; overflow: hidden; background: transparent; }
      body { box-sizing: border-box; display: flex; justify-content: center; padding: 4px 0 0; }
      ${themeStyles}
    </style>
  </head>
  <body>
    ${widgetMarkup}
    <script src="https://www.thumbtack.com/profile/widgets/scripts/?service_pk=${SERVICE_ID}&widget_id=review&type=${type}"></script>
  </body>
</html>`;
}

/**
 * Thumbtack's two official snippets both target a global `#tt-dynamic` node.
 * Separate sandboxed documents keep the widgets from overwriting each other
 * and keep Thumbtack's stylesheet from leaking into the landing page.
 */
export function ThumbtackReviewWidget({ type }: { type: WidgetType }) {
  const isLatestReview = type === "one";

  return (
    <iframe
      title={
        isLatestReview
          ? "Latest Thumbtack review"
          : "Progressive Transportation Services Thumbtack rating"
      }
      srcDoc={widgetDocument(type)}
      className="block w-[279px] max-w-full border-0 bg-transparent"
      style={{ height: isLatestReview ? 219 : 122 }}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      scrolling="no"
    />
  );
}
