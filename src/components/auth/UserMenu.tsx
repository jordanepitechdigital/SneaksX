'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  User,
  Settings,
  Shield,
  LogOut,
  Crown,
  Store,
  ChevronDown,
  Bell,
  Heart,
  ShoppingCart,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth, useAuthActions } from '@/hooks/auth';
import { RoleGate } from './RoleGate';
import { cn } from '@/lib/utils';

interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { logout } = useAuthActions();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!user) {
    return (
      <div className="flex items-center space-x-2">
        <Link href="/auth/login">
          <Button variant="ghost" size="sm">
            Sign In
          </Button>
        </Link>
        <Link href="/auth/register">
          <Button size="sm">
            Sign Up
          </Button>
        </Link>
      </div>
    );
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'text-red-600';
      case 'vendor':
        return 'text-blue-600';
      case 'user':
      default:
        return 'text-green-600';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Crown className="h-3 w-3" />;
      case 'vendor':
        return <Store className="h-3 w-3" />;
      case 'user':
      default:
        return <User className="h-3 w-3" />;
    }
  };

  return (
    <div className={cn('relative', className)} ref={menuRef}>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2"
      >
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
          {user.profile.avatar_url ? (
            <img
              src={user.profile.avatar_url}
              alt={user.profile.full_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <User className="h-4 w-4 text-primary/60" />
          )}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium">{user.profile.full_name}</p>
          <div className="flex items-center space-x-1">
            {getRoleIcon(user.role)}
            <p className={cn('text-xs capitalize', getRoleColor(user.role))}>
              {user.role}
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform',
            isOpen && 'transform rotate-180'
          )}
        />
      </Button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-background border rounded-lg shadow-lg z-50">
          {/* User Info Header */}
          <div className="p-4 border-b">
            <div className="flex items-center space-x-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                {user.profile.avatar_url ? (
                  <img
                    src={user.profile.avatar_url}
                    alt={user.profile.full_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-6 w-6 text-primary/60" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user.profile.full_name}</p>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                <div className="flex items-center space-x-1 mt-1">
                  {getRoleIcon(user.role)}
                  <span className={cn('text-xs capitalize font-medium', getRoleColor(user.role))}>
                    {user.role}
                  </span>
                  {user.profile.email_verified && (
                    <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
                      Verified
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="p-2">
            {/* User Actions */}
            <div className="space-y-1">
              <Link
                href="/profile"
                className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <User className="h-4 w-4" />
                <span>Profile Settings</span>
              </Link>

              <Link
                href="/watchlist"
                className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Heart className="h-4 w-4" />
                <span>Watchlist</span>
              </Link>

              <Link
                href="/orders"
                className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <ShoppingCart className="h-4 w-4" />
                <span>My Orders</span>
              </Link>

              <Link
                href="/notifications"
                className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Bell className="h-4 w-4" />
                <span>Notifications</span>
              </Link>
            </div>

            {/* Vendor Actions */}
            <RoleGate allowedRoles={['vendor', 'admin']}>
              <div className="border-t my-2 pt-2">
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Vendor
                </p>
                <div className="space-y-1">
                  <Link
                    href="/vendor/dashboard"
                    className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <BarChart3 className="h-4 w-4" />
                    <span>Vendor Dashboard</span>
                  </Link>

                  <Link
                    href="/vendor/inventory"
                    className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Store className="h-4 w-4" />
                    <span>Inventory</span>
                  </Link>
                </div>
              </div>
            </RoleGate>

            {/* Admin Actions */}
            <RoleGate allowedRoles="admin">
              <div className="border-t my-2 pt-2">
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Admin
                </p>
                <div className="space-y-1">
                  <Link
                    href="/admin/dashboard"
                    className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Crown className="h-4 w-4" />
                    <span>Admin Panel</span>
                  </Link>

                  <Link
                    href="/admin/users"
                    className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <User className="h-4 w-4" />
                    <span>User Management</span>
                  </Link>
                </div>
              </div>
            </RoleGate>

            {/* Bottom Actions */}
            <div className="border-t my-2 pt-2 space-y-1">
              <Link
                href="/profile/security"
                className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Shield className="h-4 w-4" />
                <span>Security</span>
              </Link>

              <Link
                href="/settings"
                className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>

              <button
                onClick={() => {
                  logout();
                  setIsOpen(false);
                }}
                className="flex items-center space-x-3 w-full px-3 py-2 text-sm rounded-md hover:bg-destructive/10 text-destructive transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}