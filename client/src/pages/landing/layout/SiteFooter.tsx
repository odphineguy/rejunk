import { Link } from "wouter";

import {
  FACEBOOK_URL,
  GOOGLE_BUSINESS_URL,
  LEGAL_DISCLOSURE,
  NAV_ITEMS,
  bookingUrl,
  PHONE_DISPLAY,
  PHONE_HREF,
  SERVICE_AREA,
  THUMBTACK_PROFILE_URL,
  YELP_URL,
} from "../content/site";
import { PALETTE } from "../palette";

const P = PALETTE;

// Official single-color brand glyphs (from simple-icons), rendered white.
const ICON_PATHS = {
  yelp: "m7.6885 15.1415-3.6715.8483c-.3769.0871-.755.183-1.1452.155-.2611-.0188-.5122-.0414-.7606-.213a1.179 1.179 0 0 1-.331-.3594c-.3486-.5519-.3656-1.3661-.3697-2.0004a6.2874 6.2874 0 0 1 .3314-2.0642 1.857 1.857 0 0 1 .1073-.2474 2.3426 2.3426 0 0 1 .1255-.2165 2.4572 2.4572 0 0 1 .1563-.1975 1.1736 1.1736 0 0 1 .399-.2831 1.082 1.082 0 0 1 .4592-.0837c.2355.0016.5139.052.91.1734.0555.0191.1237.0382.1856.0572.3277.1013.7048.2404 1.1499.3987.6863.2404 1.3663.487 2.0463.7397l1.2117.4423c.2217.0807.4363.18.6412.297.174.0984.3273.2298.4512.387a1.217 1.217 0 0 1 .192.4309 1.2205 1.2205 0 0 1-.872 1.4522c-.0468.0151-.0852.0239-.1085.0293l-1.105.2553-.0031-.001zM18.8208 7.565a1.8506 1.8506 0 0 0-.2042-.1754 2.4082 2.4082 0 0 0-.2077-.1394 2.3607 2.3607 0 0 0-.2269-.109 1.1705 1.1705 0 0 0-.482-.0796 1.0862 1.0862 0 0 0-.4498.1263c-.2107.1048-.4388.2732-.742.5551-.042.0417-.0947.0886-.142.133-.2502.2351-.5286.5252-.8599.863a114.6363 114.6363 0 0 0-1.5166 1.5629l-.8962.9293a4.1897 4.1897 0 0 0-.4466.5483 1.541 1.541 0 0 0-.2364.5459 1.2199 1.2199 0 0 0 .0107.4518l.0046.02a1.218 1.218 0 0 0 1.4184.923 1.162 1.162 0 0 0 .1105-.0213l4.7781-1.104c.3766-.087.7587-.1667 1.097-.3631.2269-.1316.4428-.262.5909-.5252a1.1793 1.1793 0 0 0 .1405-.4683c.0733-.6512-.2668-1.3908-.5403-1.963a6.2792 6.2792 0 0 0-1.2001-1.7103zM8.9703.0754a8.6724 8.6724 0 0 0-.83.1564c-.2754.066-.548.1383-.8146.2236-.868.2844-2.0884.8063-2.295 1.8065-.1165.5655.1595 1.1439.3737 1.66.2595.6254.614 1.1889.9373 1.7777.8543 1.5545 1.7245 3.0993 2.5922 4.6457.259.4617.5416 1.0464 1.043 1.2856a1.058 1.058 0 0 0 .1013.0383c.2248.0851.4699.1016.7041.0471a4.3015 4.3015 0 0 0 .0418-.0097 1.2136 1.2136 0 0 0 .5658-.3397 1.1033 1.1033 0 0 0 .079-.0822c.3463-.435.3454-1.0833.3764-1.6134.1042-1.771.2139-3.5423.3009-5.3142.0332-.6712.1055-1.3333.0655-2.0096-.0328-.5579-.0368-1.1984-.3891-1.6563-.6218-.8073-1.9476-.741-2.8523-.6158zm2.084 15.9505a1.1053 1.1053 0 0 0-1.2306-.4145 1.1398 1.1398 0 0 0-.1526.0633 1.4806 1.4806 0 0 0-.2171.1354c-.1992.1475-.3668.3392-.5196.5315-.0386.049-.074.1143-.12.1562l-.7686 1.0573a113.9168 113.9168 0 0 0-1.2913 1.789c-.278.3895-.5184.7184-.7083 1.0094-.036.0547-.0734.116-.1075.1647-.2277.3522-.3566.6092-.4228.8381a1.0945 1.0945 0 0 0-.046.4721c.0211.1655.0768.3246.1635.467.046.0715.0957.1406.1487.207a2.334 2.334 0 0 0 .1754.1825 1.843 1.843 0 0 0 .2108.1732c.5304.369 1.1112.6342 1.722.8391a6.0958 6.0958 0 0 0 1.5716.3004c.091.0046.1821.0025.2728-.006a2.3878 2.3878 0 0 0 .2506-.0351 2.3862 2.3862 0 0 0 .2447-.071 1.1927 1.1927 0 0 0 .4175-.2658c.1127-.113.1994-.249.2541-.3989.0889-.2214.1473-.5026.1857-.92.0034-.0593.0118-.1305.0177-.1958.0304-.3463.0443-.7531.0666-1.2315.0375-.7357.067-1.4681.0903-2.2026 0 0 .0495-1.3053.0494-1.306.0113-.3008.002-.6342-.0814-.9336a1.396 1.396 0 0 0-.1756-.4054zm8.6754 2.0439c-.1605-.176-.3878-.3514-.7462-.5682-.0518-.0288-.1124-.0674-.1684-.1009-.2985-.1795-.658-.3684-1.078-.5965a120.7615 120.7615 0 0 0-1.9427-1.042l-1.1515-.6107c-.0597-.0175-.1203-.0607-.1766-.0878-.2212-.1058-.4558-.2045-.6992-.2498a1.4915 1.4915 0 0 0-.2545-.0265 1.1527 1.1527 0 0 0-.1648.01 1.1077 1.1077 0 0 0-.9227.9133 1.4186 1.4186 0 0 0 .0159.439c.0563.3065.1932.6096.3346.875l.615 1.1526c.3422.65.6884 1.2963 1.0435 1.9406.229.4202.4196.7799.5982 1.078.0338.056.0721.1163.1011.1682.2173.3584.392.584.569.7458.1146.1107.252.195.4026.247.1583.0525.326.071.4919.0546a2.368 2.368 0 0 0 .251-.0435c.0817-.022.1622-.048.241-.0784a1.863 1.863 0 0 0 .2475-.1143 6.1018 6.1018 0 0 0 1.2818-.9597c.4596-.4522.8659-.9454 1.182-1.51.044-.08.0819-.163.1138-.2483a2.49 2.49 0 0 0 .0773-.2411c.0186-.083.033-.1669.0429-.2513a1.188 1.188 0 0 0-.0565-.491 1.0933 1.0933 0 0 0-.248-.4041z",
  google:
    "M3.273 1.636c-.736 0-1.363.492-1.568 1.16L0 9.272c0 1.664 1.336 3 3 3a3 3 0 003-3c0 1.664 1.336 3 3 3a3 3 0 003-3c0 1.65 1.35 3 3 3 1.664 0 3-1.336 3-3 0 1.664 1.336 3 3 3s3-1.336 3-3l-1.705-6.476a1.646 1.646 0 00-1.568-1.16zm8.729 9.326c-.604 1.063-1.703 1.81-3.002 1.81-1.304 0-2.398-.747-3-1.806-.604 1.06-1.702 1.806-3 1.806-.484 0-.944-.1-1.363-.277v8.232c0 .9.736 1.637 1.636 1.637h17.454c.9 0 1.636-.737 1.636-1.637v-8.232a3.48 3.48 0 01-1.363.277c-1.304 0-2.398-.746-3-1.804-.602 1.058-1.696 1.804-3 1.804-1.299 0-2.394-.75-2.998-1.81zm5.725 3.765c.808 0 1.488.298 2.007.782l-.859.859a1.623 1.623 0 00-1.148-.447c-.98 0-1.772.827-1.772 1.806 0 .98.792 1.807 1.772 1.807.882 0 1.485-.501 1.615-1.191h-1.615v-1.16h2.826c.035.196.054.4.054.613 0 1.714-1.147 2.931-2.88 2.931a3 3 0 010-6z",
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  thumbtack:
    "M6.18 6.38h11.69v2.68H6.17zm7.27 3.8v3.14c0 3.23-.02 3.74-.14 4.36a7.95 7.95 0 0 1-1.3 2.87c-.03 0-.78-1.35-.9-1.62-.17-.4-.3-.8-.4-1.25l-.09-.41-.02-5.78.16-.2a3.3 3.3 0 0 1 2.44-1.1zM12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0Z",
} as const;

const SOCIAL_LINKS = [
  { label: "Yelp", href: YELP_URL, path: ICON_PATHS.yelp },
  {
    label: "Google Business Profile",
    href: GOOGLE_BUSINESS_URL,
    path: ICON_PATHS.google,
  },
  { label: "Facebook", href: FACEBOOK_URL, path: ICON_PATHS.facebook },
  {
    label: "Thumbtack",
    href: THUMBTACK_PROFILE_URL,
    path: ICON_PATHS.thumbtack,
  },
].filter(link => link.href);

/** Marketing footer on pine: services, contact, service area, legal row, staff entrance. */
export function SiteFooter() {
  return (
    <footer style={{ background: P.pine, color: P.paperSoft }}>
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-3 md:px-8 md:py-16">
        <div>
          {/* progressive-logo-footer.png: wordmark on pine field (#052a2b) so it
              blends seamlessly into the dark footer. */}
          <img
            src="/progressive-logo-footer.png"
            alt="Progressive Transportation Services"
            className="h-16 w-auto"
          />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            Junk removal, local moving, pallet delivery, and furniture assembly
            across the {SERVICE_AREA}, plus in-state piano moving throughout
            Arizona. Straightforward prices, careful crews, and work done all
            the way through.
          </p>
        </div>

        <nav aria-label="Footer services">
          <h2
            className="font-display text-sm font-bold uppercase tracking-wider"
            style={{ color: P.paper }}
          >
            Services
          </h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {NAV_ITEMS.map(item => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="transition-opacity hover:opacity-70"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={bookingUrl("footer")}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold transition-opacity hover:opacity-70"
                style={{ color: P.lime }}
              >
                Book online ↗
              </a>
            </li>
            <li>
              <Link
                href="/estimate"
                className="font-semibold transition-opacity hover:opacity-70"
                style={{ color: P.lime }}
              >
                Get a Free Estimate
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2
            className="font-display text-sm font-bold uppercase tracking-wider"
            style={{ color: P.paper }}
          >
            Talk to us
          </h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            <li>
              <a
                href={PHONE_HREF}
                className="transition-opacity hover:opacity-70"
                style={{ color: P.paper }}
              >
                {PHONE_DISPLAY}
              </a>
            </li>
            <li>{SERVICE_AREA}</li>
          </ul>

          {SOCIAL_LINKS.length > 0 && (
            <>
              <h2
                className="font-display mt-6 text-sm font-bold uppercase tracking-wider"
                style={{ color: P.paper }}
              >
                Find us on
              </h2>
              <div className="mt-3 flex items-center gap-3">
                {SOCIAL_LINKS.map(link => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${link.label} (opens in a new tab)`}
                    className="flex h-10 w-10 items-center justify-center rounded-full border transition-opacity hover:opacity-70"
                    style={{ borderColor: P.pineLine }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="#ffffff"
                      aria-hidden="true"
                    >
                      <path d={link.path} />
                    </svg>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Legal row (carried over from the V2 footer) + the quiet staff entrance. */}
      <div
        className="flex flex-col items-center gap-1 border-t px-6 py-6 text-center text-xs md:flex-row md:justify-center md:gap-3"
        style={{ borderColor: P.pineLine }}
      >
        <span>Progressive Transportation Services LLC</span>
        <span className="hidden md:inline">·</span>
        <span>Phoenix, AZ</span>
        <span className="hidden md:inline">·</span>
        <span>USDOT 4421119</span>
        <span className="hidden md:inline">·</span>
        <span>MC-1763629</span>
        <span className="hidden md:inline">·</span>
        <span>© {new Date().getFullYear()}</span>
        <span className="hidden md:inline">·</span>
        <Link href="/terms" className="transition-opacity hover:opacity-100">
          Terms
        </Link>
        <span className="hidden md:inline">·</span>
        <Link href="/privacy" className="transition-opacity hover:opacity-100">
          Privacy
        </Link>
        <span className="hidden md:inline">·</span>
        <Link
          href="/login"
          className="opacity-60 transition-opacity hover:opacity-100"
        >
          Staff sign-in
        </Link>
      </div>
      <div
        className="border-t px-6 py-4 text-center text-xs"
        style={{ borderColor: P.pineLine }}
      >
        <p>{LEGAL_DISCLOSURE}</p>
      </div>
    </footer>
  );
}
