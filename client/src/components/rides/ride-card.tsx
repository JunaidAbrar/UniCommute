import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Users, Car, Trash2, Minus } from "lucide-react";
import type { Ride } from "@shared/schema";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface RideCardProps {
  ride: Ride;
  onSwipe?: () => void;
}

export function RideCard({ ride, onSwipe }: RideCardProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const isHost = user?.id === ride.hostId;
  const isParticipant = ride.participants.includes(user?.id ?? -1);

  const handleDelete = async () => {
    try {
      await apiRequest("DELETE", `/api/rides/${ride.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      toast({
        title: "Success",
        description: ride.transportType === "PERSONAL"
          ? "Ride deleted successfully"
          : "You've left the ride successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete ride",
        variant: "destructive",
      });
    }
  };

  const handleJoinRide = async () => {
    try {
      await apiRequest("POST", "/api/requests", { rideId: ride.id });
      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      toast({
        title: "Success",
        description: "Successfully joined the ride",
      });
      onSwipe?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to join ride",
        variant: "destructive",
      });
    }
  };

  const handleLeaveRide = async () => {
    try {
      await apiRequest("POST", `/api/rides/${ride.id}/leave`);
      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      toast({
        title: "Success",
        description: "You've left the ride successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to leave ride",
        variant: "destructive",
      });
    }
  };

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(e, { offset, velocity }) => {
        if (offset.x > 100 && velocity.x > 20 && !isHost && !isParticipant) {
          handleJoinRide();
        }
      }}
      className="touch-none"
    >
      <Card className="w-full max-w-sm mx-auto">
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar>
            <AvatarFallback>
              {isHost ? "H" : "U"}
            </AvatarFallback>
          </Avatar>
          <CardTitle className="text-lg">
            {isHost ? "Your Ride" : `Ride #${ride.id}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Route:</span>
              </div>
              <div className="pl-6 space-y-1">
                <p className="text-sm">From: {ride.origin}</p>
                {ride.stopPoints && ride.stopPoints.map((stop, index) => (
                  <p key={index} className="text-sm text-muted-foreground">
                    Stop {index + 1}: {stop}
                  </p>
                ))}
                <p className="text-sm">To: {ride.destination}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {new Date(ride.departureTime).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {ride.seatsAvailable} seats available • {ride.participants.length} joined
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{ride.transportType}</span>
            </div>
            <div className="flex gap-2 pt-4">
              {isParticipant && (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setLocation(`/chat/${ride.id}`)}
                  >
                    Chat
                  </Button>
                  {!isHost && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={handleLeaveRide}
                      title="Leave ride"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
              {isHost && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={handleDelete}
                  title={ride.transportType === "PERSONAL" ? "Delete ride" : "Leave ride"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {!isParticipant && (
                <Button className="flex-1" onClick={handleJoinRide}>
                  Join Ride
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}