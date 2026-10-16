'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

function NavBarContent() {
  const pathname = usePathname();
  
  const navItems = [
    { name: 'New Comparison', href: '/' },
    { name: 'Job History', href: '/jobs' },
    { name: 'Crawl History', href: '/crawl' },
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="flex items-center space-x-8">
      <h1 className="text-xl font-bold">URL Compare</h1>
      <div className="flex space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {item.name}
              </Link>
            ))}
      </div>
    </div>
  );
}

export function NavBar() {
  return (
    <nav className="border-b bg-background">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <NavBarContent />
      </div>
    </nav>
  );
}
