
        // Create particle effect
        function createParticles() {
            const particlesContainer = document.getElementById('particles');
            const particleCount = 50;

            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.animationDelay = Math.random() * 10 + 's';
                particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
                particlesContainer.appendChild(particle);
            }
        }

        // Typing effect for header
        function typeWriter(element, text, speed = 100) {
            let i = 0;
            element.textContent = '';
            function type() {
                if (i < text.length) {
                    element.textContent += text.charAt(i);
                    i++;
                    setTimeout(type, speed);
                }
            }
            setTimeout(type, 1000);
        }

        // Intersection Observer for animations
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animationPlayState = 'running';
                }
            });
        }, observerOptions);

        // Initialize everything when DOM is loaded
        document.addEventListener('DOMContentLoaded', function() {
            createParticles();

            // Start typing effect
            const headerTitle = document.querySelector('.header h1');
            typeWriter(headerTitle, 'DEMONIC');

            // Observe elements for animations
            const animatedElements = document.querySelectorAll('.slide-in-left, .slide-in-right');
            animatedElements.forEach(el => {
                el.style.animationPlayState = 'paused';
                observer.observe(el);
            });

            // Add click effects
            const featureCards = document.querySelectorAll('.feature-card');
            featureCards.forEach(card => {
                card.addEventListener('click', function() {
                    this.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        this.style.transform = '';
                    }, 150);
                });
            });

            // Add scroll effects
            window.addEventListener('scroll', function() {
                const scrolled = window.pageYOffset;
                const rate = scrolled * -0.5;

                // Parallax effect for particles
                document.querySelector('.particles').style.transform = `translateY(${rate}px)`;
            });

        });

        // Add some dynamic content
        setInterval(() => {
            const stats = document.querySelectorAll('.stat-card h3');
            stats.forEach(stat => {
                if (stat.textContent.includes('+')) {
                    const base = parseInt(stat.textContent, 10);
                    if (!Number.isNaN(base)) {
                        const random = Math.floor(Math.random() * 10);
                        stat.textContent = (base + random) + '+';
                        setTimeout(() => {
                            stat.textContent = base + '+';
                        }, 2000);
                    }
                }
            });
        }, 5000);
    