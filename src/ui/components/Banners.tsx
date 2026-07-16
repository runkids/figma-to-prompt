interface Props {
  protocolMismatch: boolean;
}

export function Banners({ protocolMismatch }: Props) {
  if (!protocolMismatch) return null;
  return (
    <div class="protocol-banner" role="alert">
      <span>
        Plugin outdated — please{' '}
        <a
          href="https://github.com/runkids/figma-to-prompt/releases"
          target="_blank"
          rel="noopener"
          class="update-link"
        >
          download the latest version
        </a>
      </span>
    </div>
  );
}
