import Link from 'next/link';
import { Facebook, Twitter, Instagram, Linkedin } from 'lucide-react'; // Using Lucide icons

export function Footer() {
  const socialLinks = [
    { Icon: Facebook, href: '#' },
    { Icon: Twitter, href: '#' },
    { Icon: Instagram, href: '#' },
    { Icon: Linkedin, href: '#' },
  ];

  const footerLinks = [
    {
      title: "Entreprise",
      links: [
        { name: "À propos", href: "#" },
      ],
    },
    {
      title: "Support",
      links: [
        { name: "Centre d'aide", href: "#" },
        { name: "Contactez-nous", href: "#" },
        { name: "Conditions d'utilisation", href: "#" },
      ],
    },
    {
        title: "Communauté",
        links: [
            { name: "Directives", href: "#" },
            { name: "Événements", href: "#" },
        ],
    },
     {
        title: "Légal",
        links: [
            { name: "Politique de cookies", href: "#" },
            { name: "Mentions légales", href: "#" },
        ],
    }
  ];

  return (
    <footer className="bg-card py-8 md:py-12 mt-auto border-t border-border/40">
      <div className="container mx-auto px-4">
        {/* Social Links */}
        <div className="flex justify-center md:justify-start space-x-6 mb-8">
          {socialLinks.map(({ Icon, href }, index) => (
            <Link key={index} href={href} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
              <Icon className="h-5 w-5" />
            </Link>
          ))}
        </div>

        {/* Footer Links Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8 text-sm mb-8">
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h4 className="font-semibold text-foreground mb-3">{section.title}</h4>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <Link href={link.href} className="text-muted-foreground hover:text-foreground transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Copyright */}
        <div className="text-center text-xs text-muted-foreground pt-8 border-t border-border/40">
          &copy; {new Date().getFullYear()} PartyHub. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}
