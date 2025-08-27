'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export function NavBar() {
  const [isMounted, setIsMounted] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const navItems = [
    { name: 'New Comparison', href: '/', matchExact: false },
    { name: 'Job History', href: '/jobs', matchExact: true },
  ];

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isActive = (href: string, matchExact: boolean) => {
    if (!isMounted) return false;
    
    // For the home page, we want to show it as active for both '/' and '/?jobId=...'
    if (href === '/') {
      return pathname === '/';
    }
    
    // For other routes, match exactly
    return pathname === href;
  };

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center space-x-8">
          <h1 className="text-xl font-bold">URL Compare</h1>
          <div className="flex space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive(item.href, item.matchExact)
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
