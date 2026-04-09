'use client';

import Image from 'next/image';
import './styles.scss';

export default function Header() {
  const links = [
    { label: 'Quem somos' },
    { label: 'Especialistas' },
    { label: 'Empresas' },
    { label: 'Startups' },
    { label: 'Blog' },
  ];

  return (
    <div id="headerContainer">
      <div className="logo">
        <Image
          src="/icons/next._icon.svg"
          alt="logo"
          width={96}
          height={80}
          priority
        />
      </div>
      <div>
        <ul className="lista-horizontal">
          {links.map((link, index) => (
            <li key={index}>
              <a href="#">{link.label}</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
