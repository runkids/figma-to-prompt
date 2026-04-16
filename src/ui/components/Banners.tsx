interface Props {
  protocolMismatch: boolean;
  updateAvailable: { version: string; url: string } | null;
}

export function Banners({ protocolMismatch, updateAvailable }: Props) {
  return (
    <>
      {protocolMismatch && (
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
      )}
      {updateAvailable && (
        <div class="update-banner" role="alert">
          <span>v{updateAvailable.version} available!</span>
          <a href={updateAvailable.url} target="_blank" rel="noopener" class="update-link">
            Download
          </a>
        </div>
      )}
    </>
  );
}
