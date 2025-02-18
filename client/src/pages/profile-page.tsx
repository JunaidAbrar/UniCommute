import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ChevronLeft, CreditCard, User, MapPin, Clock, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Ride } from "@shared/schema";

export default function ProfilePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: rides = [] } = useQuery<Ride[]>({
    queryKey: ["/api/rides"],
  });

  const activeRide = rides.find(ride => 
    ride.participants.includes(user?.id ?? -1) && ride.isActive
  );

  if (!user) return null;

  return (
    <div className="container max-w-md p-4 pb-24 mx-auto">
      <header className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your account</p>
        </div>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Account Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Username</span>
              <p className="font-medium">{user.username}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Email</span>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">University</span>
              <p className="font-medium">{user.university}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Gender</span>
              <p className="font-medium capitalize">{user.gender}</p>
            </div>
          </CardContent>
        </Card>

        {activeRide && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Active Ride
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-muted-foreground">Route</span>
                  <p className="font-medium">From: {activeRide.origin}</p>
                  <p className="font-medium">To: {activeRide.destination}</p>
                </div>
                {activeRide.stopPoints.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">Stops</span>
                    {activeRide.stopPoints.map((stop, index) => (
                      <p key={index} className="text-sm">
                        {stop}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Departure</span>
                <p className="font-medium">
                  {new Date(activeRide.departureTime).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Status</span>
                <p className="font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {activeRide.participants.length} participants
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => navigate(`/chat/${activeRide.id}`)}
              >
                Open Chat
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment & Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Manage your payment methods and subscription plans
            </p>
            <Button className="w-full mt-4" variant="outline">
              Manage Payments
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}