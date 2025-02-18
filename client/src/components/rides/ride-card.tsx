import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Users, Car, Trash2, Minus, UserX } from "lucide-react";
import type { Ride } from "@shared/schema";
import type { User } from "@shared/schema"; // Added import for User type
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface RideCardProps {
  ride: { ride: Ride; creator: User };
  onSwipe?: () => void;
}

export function RideCard({ ride: { ride, creator }, onSwipe }: RideCardProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const isHost = user?.id === ride.hostId;
  const isParticipant = ride.participants.includes(user?.id ?? -1);
  const canJoin = !isHost && !isParticipant && (!ride.femaleOnly || user?.gender === 'female');

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
    if (ride.femaleOnly && user?.gender !== 'female') {
      toast({
        title: "Cannot Join Ride",
        description: "This ride is for female participants only",
        variant: "destructive",
      });
      return;
    }

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

  const handleKickMember = async (userId: number) => {
    try {
      await apiRequest("POST", `/api/rides/${ride.id}/kick/${userId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      toast({
        title: "Success",
        description: "Member removed from ride",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove member",
        variant: "destructive",
      });
    }
  };

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(e, { offset, velocity }) => {
        if (offset.x > 100 && velocity.x > 20 && canJoin) {
          handleJoinRide();
        }
      }}
      className="touch-none"
    >
      <Card className="w-full max-w-sm mx-auto">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <Avatar>
                <AvatarFallback>
                  {creator.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <CardTitle className="text-lg leading-none line-clamp-1">
                  {isHost ? "Your Ride" : `${creator.username}'s Ride #${ride.id}`}
                </CardTitle>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {creator.university}
                </p>
              </div>
            </div>
            {ride.femaleOnly && (
              <Badge
                variant="secondary"
                className="bg-pink-100 text-pink-800 hover:bg-pink-100 hover:text-pink-800 shrink-0"
              >
                Female Only
              </Badge>
            )}
          </div>
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
            {isHost && (
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium mb-2">Participants</h4>
                <div className="space-y-2">
                  {ride.participants
                    .filter(id => id !== ride.hostId)
                    .map((participantId) => (
                      <div key={participantId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>U</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">User #{participantId}</span>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Participant</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove this participant from the ride?
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleKickMember(participantId)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                </div>
              </div>
            )}
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
              {canJoin && (
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