import numpy as np

from gym_art.quadrotor_multi.scenarios.base import QuadrotorScenario


class Scenario_ep_figure8_lemniscate(QuadrotorScenario):
    @staticmethod
    def figure8_lemniscate(tick, a=1.0, scale=0.03):
        # The classic figure-eight lemniscate (Bernoulli's lemniscate)
        # Parametric equations:
        # x = a * cos(t) / (1 + sin(t)^2)
        # y = a * sin(t) * cos(t) / (1 + sin(t)^2)
        # z = oscillating height to make it 3D
        t = tick
        denominator = 1 + np.sin(t)**2
        x = scale * (a * np.cos(t) / denominator)
        y = scale * (a * np.sin(t) * np.cos(t) / denominator)
        z = scale * (0.5 * np.sin(2*t))  # Adding vertical oscillation for 3D motion
        return x, y, z

    def step(self):
        control_freq = self.envs[0].control_freq
        tick = self.envs[0].tick / control_freq
        x, y, z = self.figure8_lemniscate(tick)
        goal_x, goal_y, goal_z = self.goals[0]
        x_new, y_new, z_new = x + goal_x, y + goal_y, z + goal_z
        self.goals = np.array([[x_new, y_new, z_new] for _ in range(self.num_agents)])

        for i, env in enumerate(self.envs):
            env.goal = self.goals[i]

        return

    def update_formation_size(self, new_formation_size):
        pass

    def reset(self):
        # Reset formation and related parameters
        self.update_formation_and_relate_param()

        # Generate goals
        self.formation_center = np.array([-2.0, 0.0, 2.0])  # prevent drones from crashing into the wall
        self.goals = self.generate_goals(num_agents=self.num_agents, formation_center=self.formation_center,
                                       layer_dist=0.0)
