const poster = document.querySelector('.hero__outline');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (poster && !reducedMotion.matches) {
    let scheduled = false;

    const driftPoster = () => {
        const distance = Math.min(window.scrollY * 0.012, 12);
        document.documentElement.style.setProperty('--scroll-drift', `${distance}px`);
        scheduled = false;
    };

    window.addEventListener('scroll', () => {
        if (!scheduled) {
            window.requestAnimationFrame(driftPoster);
            scheduled = true;
        }
    }, { passive: true });
}

const videoFrame = document.querySelector('[data-video]');
const videoButton = videoFrame?.querySelector('.video__facade');

videoButton?.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/xXTGE93dHKc?rel=0';
    iframe.title = 'How It Starts by Cam Leinad';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    videoFrame.replaceChildren(iframe);
});