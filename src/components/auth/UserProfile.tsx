'use client';

import { useState, useRef } from 'react';
import { User, Mail, Phone, Calendar, Camera, Save, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useAuth } from '@/hooks/auth';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface UserProfileProps {
  className?: string;
}

export function UserProfile({ className }: UserProfileProps) {
  const { user, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [formData, setFormData] = useState({
    full_name: user?.profile.full_name || '',
    phone: user?.profile.phone || '',
    date_of_birth: user?.profile.date_of_birth || '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) {
    return null;
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      const result = await updateProfile({
        full_name: formData.full_name,
        phone: formData.phone || undefined,
        date_of_birth: formData.date_of_birth || undefined,
      });

      if (result.error) {
        toast.error(result.error.message);
      } else {
        toast.success('Profile updated successfully');
        setIsEditing(false);
      }
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      full_name: user.profile.full_name || '',
      phone: user.profile.phone || '',
      date_of_birth: user.profile.date_of_birth || '',
    });
    setIsEditing(false);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Here you would typically upload the file to Supabase Storage
    // For now, we'll just show a toast message
    toast.success('Avatar upload feature coming soon!');
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'vendor':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'user':
      default:
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    }
  };

  return (
    <div className={cn('max-w-2xl mx-auto p-6 space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Profile Settings</h1>
        {!isEditing && (
          <Button
            onClick={() => setIsEditing(true)}
            variant="outline"
            size="sm"
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Edit Profile
          </Button>
        )}
      </div>

      {/* Profile Card */}
      <div className="bg-card rounded-lg border p-6 space-y-6">
        {/* Avatar Section */}
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              {user.profile.avatar_url ? (
                <img
                  src={user.profile.avatar_url}
                  alt={user.profile.full_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-8 w-8 text-primary/60" />
              )}
            </div>
            {isEditing && (
              <button
                onClick={handleAvatarClick}
                className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
              >
                <Camera className="h-3 w-3" />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{user.profile.full_name}</h2>
            <p className="text-muted-foreground">{user.email}</p>
            <div className="flex items-center space-x-2">
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize',
                  getRoleColor(user.role)
                )}
              >
                {user.role}
              </span>
              {user.profile.email_verified && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  Verified
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Profile Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Personal Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              {isEditing ? (
                <Input
                  id="fullName"
                  value={formData.full_name}
                  onChange={(e) => handleInputChange('full_name', e.target.value)}
                  placeholder="Enter your full name"
                />
              ) : (
                <div className="flex items-center space-x-2 p-2 border rounded-md bg-muted/50">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{user.profile.full_name || 'Not provided'}</span>
                </div>
              )}
            </div>

            {/* Email (Read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="flex items-center space-x-2 p-2 border rounded-md bg-muted/50">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{user.email}</span>
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              {isEditing ? (
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="Enter your phone number"
                  type="tel"
                />
              ) : (
                <div className="flex items-center space-x-2 p-2 border rounded-md bg-muted/50">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{user.profile.phone || 'Not provided'}</span>
                </div>
              )}
            </div>

            {/* Date of Birth */}
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              {isEditing ? (
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                />
              ) : (
                <div className="flex items-center space-x-2 p-2 border rounded-md bg-muted/50">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {user.profile.date_of_birth
                      ? new Date(user.profile.date_of_birth).toLocaleDateString()
                      : 'Not provided'
                    }
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Account Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Account Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account Status</Label>
              <div className="flex items-center space-x-2 p-2 border rounded-md bg-muted/50">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    user.profile.is_active ? 'bg-green-500' : 'bg-red-500'
                  )}
                />
                <span>{user.profile.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Member Since</Label>
              <div className="flex items-center space-x-2 p-2 border rounded-md bg-muted/50">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  {new Date(user.profile.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {isEditing && (
          <div className="flex items-center justify-end space-x-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              loading={isUpdating}
              disabled={isUpdating}
            >
              <Save className="h-4 w-4 mr-2" />
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}