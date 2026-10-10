export function createMemoryDatabase() {
  const users = [];
  const datasets = [];
  const activityLogs = [];
  let nextId = 1;
  return {
    users,
    datasets,
    activityLogs,
    user: {
      async findUnique({ where }) {
        return users.find((user) => Object.entries(where).every(([key, value]) => user[key] === value)) || null;
      },
      async create({ data }) {
        if (users.some((user) => user.email === data.email)) {
          const error = new Error("Unique constraint failed");
          error.code = "P2002";
          throw error;
        }
        const user = { id: `user-${nextId++}`, twoFactorEnabled: false, twoFactorSecret: null, sessionVersion: 0, createdAt: new Date(), updatedAt: new Date(), ...data };
        users.push(user);
        return user;
      },
      async update({ where, data }) {
        const user = users.find((entry) => entry.id === where.id);
        if (!user) throw new Error("User not found");
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === "object" && "increment" in value) user[key] += value.increment;
          else user[key] = value;
        }
        user.updatedAt = new Date();
        return user;
      },
      async updateMany({ where, data }) {
        const matching = users.filter((user) => Object.entries(where).every(([key, value]) => user[key] === value));
        for (const user of matching) {
          for (const [key, value] of Object.entries(data)) {
            if (value && typeof value === "object" && "increment" in value) user[key] += value.increment;
            else user[key] = value;
          }
          user.updatedAt = new Date();
        }
        return { count: matching.length };
      }
    },
    dataset: {
      async create({ data }) {
        const dataset = { id: `dataset-${nextId++}`, createdAt: new Date(), ...data };
        datasets.push(dataset);
        return dataset;
      },
      async findMany({ where } = {}) {
        return datasets.filter((dataset) => !where || dataset.userId === where.userId);
      }
    },
    activityLog: {
      async create({ data }) {
        const log = { id: `log-${nextId++}`, createdAt: new Date(), ...data };
        activityLogs.push(log);
        return log;
      },
      async findMany({ where } = {}) {
        return activityLogs.filter((log) => !where || log.userId === where.userId);
      },
      async findFirst({ where, orderBy } = {}) {
        const matches = activityLogs.filter((log) => !where || Object.entries(where).every(([key, value]) => log[key] === value));
        if (orderBy?.createdAt === "desc") matches.sort((a, b) => b.createdAt - a.createdAt);
        return matches[0] || null;
      }
    }
  };
}
