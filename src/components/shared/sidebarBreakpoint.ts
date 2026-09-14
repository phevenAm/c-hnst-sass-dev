// Single source of truth for "is the sidebar in its mobile (icon-strip /
// overlay) layout" — AdminSidebar and AgencyLayout used to each hardcode
// their own value (768px via a resize listener vs 860px via matchMedia),
// which is exactly the kind of silent drift that made them behave
// differently. Both now import this.
export const SIDEBAR_MOBILE_QUERY = "(max-width: 860px)";
