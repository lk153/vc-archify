// Preview-only theme control. An artifact picks its theme from ?theme=, then
// localStorage, then prefers-color-scheme. Inside a sandboxed srcdoc iframe the
// first two are unavailable and Chrome does not apply the iframe element's
// color-scheme to the media query, so the preview copy gets a tiny matchMedia
// override ahead of the viewer bootstrap. Downloads always use the untouched
// engine output.

export type PreviewTheme = 'site' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

export function withPreviewTheme(html: string, theme: ResolvedTheme): string {
  const script =
    '<script>/* vc-archify playground preview: theme override, not part of the artifact */(function(){' +
    `var light=${theme === 'light'};var nativeMatch=window.matchMedia.bind(window);` +
    'window.matchMedia=function(query){var q=String(query);if(/prefers-color-scheme/.test(q)){return{matches:/light/.test(q)===light,media:q,onchange:null,' +
    'addEventListener:function(){},removeEventListener:function(){},addListener:function(){},removeListener:function(){},dispatchEvent:function(){return false}};}' +
    'return nativeMatch(query);};})();</script>';
  const head = html.indexOf('<head>');
  if (head === -1) return html;
  const charset = html.indexOf('<meta charset', head);
  const charsetEnd = charset === -1 ? -1 : html.indexOf('>', charset);
  const at = charsetEnd !== -1 && charset - head < 200 ? charsetEnd + 1 : head + '<head>'.length;
  return `${html.slice(0, at)}\n  ${script}${html.slice(at)}`;
}
